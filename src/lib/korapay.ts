import "server-only";
import { korapayChargeState, korapayPaidKobo } from "./korapay-signature";

// Korapay Checkout Redirect with the platform's merchant account: a hosted payment page for store checkouts, the
// charge query that decides whether an order is paid, and refunds. Like Paystack there are no per-store keys.
//
// Env: KORAPAY_SECRET_KEY (every call here, and it checks webhook signatures). Test or live is the key itself:
// Korapay has one API host and separate test and live keys.

const KORAPAY_BASE = "https://api.korapay.com/merchant/api/v1";

const placeholder = (value: string) => !value || value.includes("your_") || value.includes("your-");

function secret() {
  return process.env.KORAPAY_SECRET_KEY?.trim() ?? "";
}

/** The secret key is set (not the .env.local.example placeholder). */
export function korapayReady() {
  return !placeholder(secret());
}

/** The secret key, for checking webhook signatures; null when Korapay isn't set up. */
export function korapaySecretKey() {
  return korapayReady() ? secret() : null;
}

function korapayBase() {
  // Tests only: KORAPAY_API_BASE_URL points these calls at a local stub. Ignored on the live site.
  const stub = process.env.VERCEL_ENV !== "production" ? process.env.KORAPAY_API_BASE_URL?.trim() : "";
  return stub && /^https?:\/\//.test(stub) ? stub.replace(/\/+$/, "") : KORAPAY_BASE;
}

interface KorapayReply {
  status?: boolean;
  message?: string;
  data?: Record<string, unknown> | null;
}

async function call(path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs: number }) {
  if (!korapayReady()) throw new Error("Korapay is not configured.");
  const response = await fetch(`${korapayBase()}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${secret()}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs),
  });
  return { ok: response.ok, httpStatus: response.status, json: (await response.json().catch(() => null)) as KorapayReply | null };
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

export interface KorapayChargeInput {
  /** Our reference: the RetailOrder id, so the charge query and webhooks name the order. */
  reference: string;
  /** Naira (major units). */
  amount: number;
  currency: string;
  redirectUrl: string;
  notificationUrl: string;
  narration: string;
  customer: { name?: string; email: string };
  orderNumber: string;
}

/** Opens a hosted Korapay checkout (POST /charges/initialize). Returns the URL to send the shopper to. */
export async function initializeKorapayCharge(input: KorapayChargeInput) {
  const { ok, json } = await call("/charges/initialize", {
    method: "POST",
    timeoutMs: 20_000,
    body: {
      reference: input.reference,
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.redirectUrl,
      notification_url: input.notificationUrl,
      narration: input.narration.slice(0, 100),
      channels: ["card", "bank_transfer", "pay_with_bank"],
      merchant_bears_cost: true,
      customer: { email: input.customer.email, ...(input.customer.name ? { name: input.customer.name.slice(0, 60) } : {}) },
      // At most 5 keys of letters, digits and "-" (20 characters each).
      metadata: { "order-number": input.orderNumber },
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
 * Asks Korapay what happened to a charge (GET /charges/:reference). This, not the webhook body, is what marks an
 * order paid. Returns null when Korapay has no such charge; throws when Korapay can't be reached or refuses the call.
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

export interface KorapayRefundResult {
  ok: boolean;
  status: "processing" | "success" | "failed" | null;
  message: string;
}

/** Refunds a whole payment (POST /refunds/initiate; no amount means all of it). Never throws. */
export async function createKorapayRefund(input: { reference: string; paymentReference: string; reason: string; webhookUrl: string }): Promise<KorapayRefundResult> {
  try {
    const { ok, json } = await call("/refunds/initiate", {
      method: "POST",
      timeoutMs: 15_000,
      body: { reference: input.reference.slice(0, 50), payment_reference: input.paymentReference, reason: input.reason.slice(0, 200), webhook_url: input.webhookUrl.slice(0, 200) },
    });
    const message = json?.message ?? "Korapay did not accept the refund.";
    if (!ok || json?.status !== true) return { ok: false, status: null, message: message.slice(0, 300) };
    const status = json.data?.status;
    return { ok: true, status: status === "success" || status === "failed" || status === "processing" ? status : "processing", message };
  } catch (error) {
    return { ok: false, status: null, message: error instanceof Error ? error.message : "Korapay could not be reached" };
  }
}
