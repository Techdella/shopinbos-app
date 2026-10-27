import "server-only";
import { korapayChargeState, korapayPaidKobo } from "./korapay-signature";
import { readKorapayIdentity, type IdentityCheckResult } from "./korapay-identity-rules";
import { readKorapayFaceCheck, type FaceCheckResult } from "./korapay-liveness";

// Korapay for the Shopinbos Wallet:
//   * Identity: the ID and business checks. A Nigerian BVN or NIN against the name and date of birth the owner typed
//     (https://developers.korapay.com/docs/nigeria-bvn, /nigeria-nin), and CAC numbers for suppliers and delivery
//     partners (/nigeria-certificate-incorporation, used by src/lib/kyb). Identity must be enabled on the Korapay
//     account (dashboard → Identity → request access); each live lookup is paid from the NGN balance.
//   * Checkout with Split Payments (https://developers.korapay.com/docs/split-payments): the charge is started on the
//     server with a dynamic split that sends every naira to the businesses' own Korapay split accounts, so nothing
//     is left in the Shopinbos balance. Off until KORAPAY_SPLIT_ENABLED=true (Korapay must switch Split Payments on
//     for the account, and confirm shares settle straight to the recipients' banks).
//
//   * Face check: Kora's Liveness SDK in the phone app (public key) matches a live face to the NIN's photo; the server
//     confirms the outcome by reference (./korapay-liveness.ts).
//
// Env: KORAPAY_SECRET_KEY (a test key runs Korapay's sandbox: BVN 22222222222, NIN 55555555555 and CAC RC00000011
// are found there) and KORAPAY_PUBLIC_KEY for the face check (pk_test_… runs the SDK's sandbox).

const KORAPAY_BASE = "https://api.korapay.com/merchant/api/v1";

function secret() {
  const key = process.env.KORAPAY_SECRET_KEY?.trim() ?? "";
  return key && !key.includes("your_") && !key.includes("your-") ? key : "";
}

/** Korapay's key is set, so ID checks can run. */
export function korapayIdentityReady() {
  return Boolean(secret());
}

function korapayBase() {
  // Tests only: KORAPAY_API_BASE_URL points these calls at a local stub. Ignored on the live site.
  const stub = process.env.VERCEL_ENV !== "production" ? process.env.KORAPAY_API_BASE_URL?.trim() : "";
  return stub && /^https?:\/\//.test(stub) ? stub.replace(/\/+$/, "") : KORAPAY_BASE;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The public key the phone app's Liveness SDK starts with; null when the face check isn't set up. */
export function korapayPublicKey() {
  const key = process.env.KORAPAY_PUBLIC_KEY?.trim() ?? "";
  return /^pk_(test|live)_/.test(key) ? key : null;
}

/** Face checks can run: the public key for the SDK and the secret key to confirm each result. */
export function korapayFaceCheckReady() {
  return Boolean(korapayPublicKey() && secret());
}

/** The secret key, for checking webhook signatures; null when Korapay isn't set up. */
export function korapaySecretKey() {
  return secret() || null;
}

/** Korapay checkout can be offered: keys set and Split Payments switched on (so nothing pools with Shopinbos). */
export function korapayCheckoutReady() {
  return Boolean(secret()) && process.env.KORAPAY_SPLIT_ENABLED?.trim() === "true";
}

interface KorapayReply {
  status?: boolean;
  message?: string;
  data?: Record<string, unknown> | null;
}

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs: number }) {
  const key = secret();
  if (!key) throw new Error("Korapay is not configured.");
  const response = await fetch(`${korapayBase()}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs),
  });
  return { ok: response.ok, httpStatus: response.status, json: (await response.json().catch(() => null)) as KorapayReply | null };
}

/**
 * Starts a Korapay checkout on the server (POST /charges/initialize) with the split already in it, and returns
 * Korapay's payment page. The browser shows it in a frame on the store's page (or opens it), and can't change the
 * amount or who is paid. The customer bears Korapay's fee (merchant_bears_cost false), so nothing is charged to
 * the Shopinbos balance either. Throws when Korapay refuses.
 */
export async function initializeKorapayCharge(input: {
  reference: string;
  amountNaira: number;
  currency: string;
  redirectUrl: string;
  notificationUrl: string;
  narration: string;
  customer: { name: string; email: string };
  orderNumber: string;
  split: Record<string, unknown>;
}) {
  const { ok, json } = await call("/charges/initialize", {
    method: "POST",
    timeoutMs: 20_000,
    body: {
      reference: input.reference,
      amount: input.amountNaira,
      currency: input.currency,
      redirect_url: input.redirectUrl,
      notification_url: input.notificationUrl,
      narration: input.narration.slice(0, 100),
      channels: ["card", "bank_transfer", "pay_with_bank"],
      merchant_bears_cost: false,
      customer: { email: input.customer.email, name: input.customer.name.slice(0, 60) },
      // At most 5 keys of letters, digits and "-" (20 characters each).
      metadata: { "order-number": input.orderNumber },
      ...input.split,
    },
  });
  const checkoutUrl = text(json?.data?.checkout_url) ?? "";
  if (!ok || json?.status !== true || !/^https:\/\//.test(checkoutUrl)) {
    throw new Error(json?.message ? `Korapay: ${json.message}` : "Korapay could not start this payment.");
  }
  return { checkoutUrl };
}

export interface KorapayCharge {
  /** Every reference the charge carries: ours (payment_reference, or reference) and Korapay's own (KPY-…). */
  references: string[];
  state: "success" | "failed" | "waiting";
  /** What was paid, in kobo. */
  paidKobo: number | null;
  currency: string | null;
}

/**
 * Asks Korapay what happened to a charge (GET /charges/:reference). This, not a webhook body or the browser, is
 * what marks an order paid. Null when Korapay has no such charge; throws when Korapay can't be reached.
 */
export async function queryKorapayCharge(reference: string): Promise<KorapayCharge | null> {
  const { ok, httpStatus, json } = await call(`/charges/${encodeURIComponent(reference)}`, { method: "GET", timeoutMs: 15_000 });
  if (httpStatus === 404 || (json?.status === false && /not found|does not exist/i.test(json.message ?? ""))) return null;
  if (!ok || json?.status !== true || !json.data) {
    throw new Error(json?.message ? `Korapay: ${json.message}` : "Korapay could not check this payment.");
  }
  const data = json.data;
  return {
    references: [text(data.payment_reference), text(data.reference)].filter((value): value is string => Boolean(value)),
    state: korapayChargeState(data.status),
    paidKobo: korapayPaidKobo(data),
    currency: text(data.currency),
  };
}

/**
 * Looks up a BVN or NIN (POST /identities/ng/bvn | nin) with the owner's consent and compares the name and date of
 * birth they typed (./korapay-identity-rules.ts). Never throws: an unknown number comes back as notFound, anything
 * else (no balance, Identity not enabled, Korapay down) as a message, which is logged for the team.
 */
export async function verifyKorapayIdentity(input: { type: "bvn" | "nin"; id: string; firstName: string; lastName: string; dateOfBirth: string }): Promise<IdentityCheckResult> {
  if (!secret()) return { ok: false, notFound: false, message: "ID checks aren't set up yet." };
  try {
    const { httpStatus, json } = await call(`/identities/ng/${input.type}`, {
      method: "POST",
      body: {
        id: input.id,
        verification_consent: true,
        validation: { first_name: input.firstName, last_name: input.lastName, date_of_birth: input.dateOfBirth },
      },
      timeoutMs: 30_000,
    });
    const result = readKorapayIdentity(httpStatus, json, input);
    // Shows in the Vercel logs: 401 key, 403 Identity not enabled, 402 or "insufficient balance" to top up.
    if (!result.ok && !result.notFound) console.error(`[korapay] identity ${input.type} answered ${httpStatus}: ${result.message}`);
    return result;
  } catch (error) {
    return { ok: false, notFound: false, message: error instanceof Error ? error.message : "Korapay could not be reached" };
  }
}

/**
 * Asks Kora how a face check went (GET /identities/verifications/:reference), never trusting the phone's word. Never
 * throws: Kora unreachable is a "review" outcome, so the person isn't failed for our outage.
 */
export async function fetchKorapayFaceCheck(reference: string): Promise<FaceCheckResult> {
  if (!secret()) return { outcome: "review", reference, idNumber: null, detail: "Kora isn't set up." };
  try {
    const { httpStatus, json } = await call(`/identities/verifications/${encodeURIComponent(reference)}`, { method: "GET", timeoutMs: 20_000 });
    const result = readKorapayFaceCheck(httpStatus, json);
    if (result.outcome === "review") console.error(`[korapay] face check ${reference} answered ${httpStatus}: ${result.detail} keys=${Object.keys((json?.data as Record<string, unknown> | null) ?? {}).join(",")}`);
    return result;
  } catch (error) {
    return { outcome: "review", reference, idNumber: null, detail: error instanceof Error ? error.message : "Kora could not be reached" };
  }
}

/** POSTs an Identity lookup (KYB: /identities/ng/cac). Throws only when Korapay can't be reached. */
export async function korapayIdentityPost(path: string, body: Record<string, unknown>, timeoutMs = 30_000) {
  const { httpStatus, json } = await call(path, { method: "POST", body, timeoutMs });
  if (httpStatus >= 400 && httpStatus !== 404) console.error(`[korapay] ${path} answered ${httpStatus}: ${json?.message ?? ""}`);
  return { status: httpStatus, json: json as unknown };
}

/**
 * The name on a Nigerian bank account (POST /misc/banks/resolve, free), the second opinion when Paystack's lookup
 * doesn't answer. Null when Korapay isn't set up, doesn't know the bank code or the account: the caller decides.
 */
export async function resolveKorapayBankAccount(bankCode: string, accountNumber: string): Promise<{ accountName: string } | { notFound: true } | null> {
  if (!secret()) return null;
  try {
    const { httpStatus, json } = await call("/misc/banks/resolve", { method: "POST", body: { bank: bankCode, account: accountNumber, currency: "NGN" }, timeoutMs: 10_000 });
    const name = text(json?.data?.account_name);
    if (httpStatus >= 200 && httpStatus < 300 && json?.status === true && name) return { accountName: name };
    // Korapay answers 400 with "invalid account" for a number its bank doesn't have; other refusals tell us nothing.
    if (httpStatus === 400 && /invalid account|account (number )?(is )?(invalid|not found)|could not resolve/i.test(json?.message ?? "")) return { notFound: true };
    return null;
  } catch {
    return null;
  }
}

export type KorapayIdentityHealth =
  | { state: "not_set" }
  | { state: "ok"; environment: "test" | "live"; balance: number | null }
  | { state: "key_rejected" | "unreachable" | "other"; status?: number; message?: string };

/**
 * Whether the key works, for the team (Admin → Wallets): reads the balance (free), since every live ID or CAC check
 * is paid from the NGN balance. A working key doesn't prove Identity is enabled on the account: a refused check
 * shows in the Vercel logs as "[korapay] identity … answered 403".
 */
export async function korapayIdentityHealth(): Promise<KorapayIdentityHealth> {
  const key = secret();
  if (!key) return { state: "not_set" };
  try {
    const { httpStatus, json } = await call("/balances", { method: "GET", timeoutMs: 15_000 });
    const message = text(json?.message) ?? undefined;
    if (httpStatus === 401 || httpStatus === 403) return { state: "key_rejected", status: httpStatus, message };
    if (httpStatus < 200 || httpStatus >= 300) return { state: "other", status: httpStatus, message };
    const ngn = json?.data && typeof json.data === "object" ? (json.data as Record<string, unknown>).NGN : null;
    const available = ngn && typeof ngn === "object" ? Number((ngn as Record<string, unknown>).available_balance) : NaN;
    return { state: "ok", environment: key.startsWith("sk_test") ? "test" : "live", balance: Number.isFinite(available) ? available : null };
  } catch (error) {
    return { state: "unreachable", message: error instanceof Error ? error.message : undefined };
  }
}
