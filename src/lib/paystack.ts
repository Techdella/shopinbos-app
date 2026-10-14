import "server-only";

// Tests only: PAYSTACK_API_BASE_URL points these calls at a local stub. Ignored on the live site.
const PAYSTACK_BASE = (process.env.VERCEL_ENV !== "production" && process.env.PAYSTACK_API_BASE_URL) || "https://api.paystack.co";

export interface PaystackVerification {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
  metadata?: Record<string, unknown>;
  /** The card used: reusable ones can be charged again with chargePaystackAuthorization. */
  authorization?: {
    authorization_code?: string;
    reusable?: boolean;
    last4?: string;
    brand?: string;
    exp_month?: string;
    exp_year?: string;
    [key: string]: unknown;
  };
}

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!key || key.includes("your_")) throw new Error("Paystack is not configured.");
  return key;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  } | null;
  if (!response.ok || !json?.status || !json.data?.authorization_url) {
    throw new Error(json?.message ?? "Paystack could not initialize this payment.");
  }
  return json.data;
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: PaystackVerification;
  } | null;
  if (!response.ok || !json?.status || !json.data) {
    throw new Error(json?.message ?? "Paystack could not verify this payment.");
  }
  return json.data;
}

/**
 * Refunds a whole transaction (POST /refund { transaction }). Paystack answers with the refund it queued
 * ("pending" / "processing" / "processed"); the money reaches the customer later. Throws when Paystack refuses.
 */
export async function refundPaystackTransaction(reference: string) {
  const response = await fetch(`${PAYSTACK_BASE}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transaction: reference }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { id?: number | string; status?: string };
  } | null;
  if (!response.ok || !json?.status) {
    throw new Error(json?.message ?? "Paystack could not refund this payment.");
  }
  return { id: json.data?.id === undefined ? null : String(json.data.id), status: json.data?.status ?? "pending" };
}

/**
 * Charges a saved reusable card again (POST /transaction/charge_authorization), e.g. a yearly domain renewal.
 * `email` must be the email the card was first used with. Returns Paystack's transaction status ("success",
 * "failed", or e.g. "send_otp"/"pending" when the bank wants more): only "success" is a payment, and it is still
 * verified with verifyPaystackTransaction before anything is bought.
 */
export async function chargePaystackAuthorization(input: {
  email: string;
  amountKobo: number;
  authorizationCode: string;
  reference: string;
  metadata: Record<string, unknown>;
}) {
  const response = await fetch(`${PAYSTACK_BASE}/transaction/charge_authorization`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      authorization_code: input.authorizationCode,
      reference: input.reference,
      metadata: input.metadata,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string; gateway_response?: string };
  } | null;
  if (!response.ok || !json?.status || !json.data) {
    return { status: "failed", message: json?.message ?? "Paystack could not charge the saved card." };
  }
  return { status: json.data.status ?? "failed", message: json.data.gateway_response ?? json.message ?? "" };
}
