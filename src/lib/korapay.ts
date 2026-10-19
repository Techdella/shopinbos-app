import "server-only";
import { korapayChargeState, korapayPaidKobo } from "./korapay-signature";

// Korapay for the Shopinbos Wallet:
//   * Identity: checks a Nigerian BVN or NIN against the name and date of birth the owner typed
//     (https://developers.korapay.com/docs/nigeria-bvn, /nigeria-nin). Each live lookup is charged to Shopinbos.
//   * Checkout with Split Payments (https://developers.korapay.com/docs/split-payments): the charge is started on the
//     server with a dynamic split that sends every naira to the businesses' own Korapay split accounts, so nothing
//     is left in the Shopinbos balance. Off until KORAPAY_SPLIT_ENABLED=true (Korapay must switch Split Payments on
//     for the account, and confirm shares settle straight to the recipients' banks).
//
// Env: KORAPAY_SECRET_KEY (a test key runs Korapay's sandbox: BVN 22222222222 and NIN 55555555555 pass there).

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

const match = (value: unknown) => {
  const field = value && typeof value === "object" ? (value as Record<string, unknown>).match : undefined;
  return typeof field === "boolean" ? field : null;
};

export interface KorapayIdentity {
  reference: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  dateOfBirth: string | null;
  /** Korapay's verdict on each field we sent (null when it didn't say). */
  matches: { firstName: boolean | null; lastName: boolean | null; dateOfBirth: boolean | null };
}

export type IdentityResult = { ok: true; identity: KorapayIdentity } | { ok: false; notFound: boolean; message: string };

/**
 * Looks up a BVN or NIN (POST /identities/ng/bvn | nin) with the owner's consent and the details to match. Never
 * throws: an unknown number comes back as notFound, anything else (no balance, Korapay down) as a message.
 */
export async function verifyKorapayIdentity(input: { type: "bvn" | "nin"; id: string; firstName: string; lastName: string; dateOfBirth: string }): Promise<IdentityResult> {
  const key = secret();
  if (!key) return { ok: false, notFound: false, message: "ID checks aren't set up yet." };
  try {
    const response = await fetch(`${korapayBase()}/identities/ng/${input.type}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        verification_consent: true,
        validation: { first_name: input.firstName, last_name: input.lastName, date_of_birth: input.dateOfBirth },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: Record<string, unknown> | null } | null;
    if (!response.ok || json?.status !== true || !json.data) {
      const message = json?.message ?? `Korapay answered ${response.status}`;
      const notFound = (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) || /not found|invalid|does not exist/i.test(message);
      return { ok: false, notFound, message };
    }
    const data = json.data;
    const validation = data.validation && typeof data.validation === "object" ? (data.validation as Record<string, unknown>) : {};
    return {
      ok: true,
      identity: {
        reference: text(data.reference),
        firstName: text(data.first_name),
        lastName: text(data.last_name),
        middleName: text(data.middle_name),
        dateOfBirth: text(data.date_of_birth),
        matches: { firstName: match(validation.first_name), lastName: match(validation.last_name), dateOfBirth: match(validation.date_of_birth) },
      },
    };
  } catch (error) {
    return { ok: false, notFound: false, message: error instanceof Error ? error.message : "Korapay could not be reached" };
  }
}
