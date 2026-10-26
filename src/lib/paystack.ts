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
  /** Who the payment is settled to (src/lib/wallet/rules.ts paystackSplitParams): a subaccount or a dynamic split. */
  split?: Record<string, unknown>;
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
      ...(input.split ?? {}),
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

// ─── Subaccounts: each business's own settlement (Shopinbos Wallet) ─────────────

export interface PaystackSubaccount {
  code: string;
  verified: boolean;
  active: boolean;
}

function readSubaccount(data: Record<string, unknown> | undefined): PaystackSubaccount | null {
  const code = typeof data?.subaccount_code === "string" ? data.subaccount_code : "";
  if (!code) return null;
  return { code, verified: data?.is_verified === true, active: data?.active !== false };
}

/**
 * Creates the subaccount a business's shares are settled to (POST /subaccount). percentage_charge 0: the main
 * (Shopinbos) account keeps nothing; each checkout also passes a zero transaction charge. Throws when Paystack
 * refuses (e.g. the account number doesn't exist at that bank).
 */
export async function createPaystackSubaccount(input: { businessName: string; bankCode: string; accountNumber: string; email?: string | null; contactName: string; phone?: string | null; walletId: string }) {
  const response = await fetch(`${PAYSTACK_BASE}/subaccount`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: input.businessName.slice(0, 100),
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: 0,
      description: "Shopinbos Wallet",
      primary_contact_name: input.contactName.slice(0, 100),
      ...(input.email ? { primary_contact_email: input.email } : {}),
      ...(input.phone ? { primary_contact_phone: input.phone } : {}),
      metadata: { walletId: input.walletId },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: Record<string, unknown> } | null;
  const subaccount = readSubaccount(json?.data);
  if (!response.ok || !json?.status || !subaccount) throw new Error(json?.message ?? "Paystack could not set up this settlement account.");
  return subaccount;
}

/** Changes the bank a subaccount settles to, or switches it on/off (PUT /subaccount/:code). */
export async function updatePaystackSubaccount(code: string, change: { bankCode?: string; accountNumber?: string; businessName?: string; active?: boolean }) {
  const response = await fetch(`${PAYSTACK_BASE}/subaccount/${encodeURIComponent(code)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(change.businessName ? { business_name: change.businessName.slice(0, 100) } : {}),
      ...(change.bankCode ? { settlement_bank: change.bankCode } : {}),
      ...(change.accountNumber ? { account_number: change.accountNumber } : {}),
      ...(change.active === undefined ? {} : { active: change.active }),
      percentage_charge: 0,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: Record<string, unknown> } | null;
  if (!response.ok || !json?.status) throw new Error(json?.message ?? "Paystack could not update this settlement account.");
  return readSubaccount(json.data);
}

/**
 * Whether a Paystack record exists on the account the current key belongs to (GET /plan/:code, /subaccount/:code,
 * /customer/:code). Test and live mode are separate: a code made with test keys is "not found" on live. Null when
 * Paystack didn't say (network, outage), so callers leave things as they are.
 */
export async function paystackRecordExists(kind: "plan" | "subaccount" | "customer", code: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${PAYSTACK_BASE}/${kind}/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${secretKey()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string } | null;
    if (response.ok && json?.status) return true;
    if (response.status === 404 || (response.status === 400 && /not found|invalid/i.test(json?.message ?? ""))) return false;
    return null;
  } catch {
    return null;
  }
}

export interface PaystackSettlement {
  id: string;
  status: string;
  /** Kobo. */
  totalAmount: number;
  settlementDate: string | null;
}

/** Recent settlements Paystack made to a subaccount's bank (GET /settlement?subaccount=…). Empty when Paystack can't say. */
export async function listPaystackSettlements(subaccountCode: string, perPage = 10): Promise<PaystackSettlement[]> {
  try {
    const response = await fetch(`${PAYSTACK_BASE}/settlement?subaccount=${encodeURIComponent(subaccountCode)}&perPage=${perPage}`, {
      headers: { Authorization: `Bearer ${secretKey()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await response.json().catch(() => null)) as { status?: boolean; data?: Array<Record<string, unknown>> } | null;
    if (!response.ok || !json?.status || !Array.isArray(json.data)) return [];
    return json.data.map((row) => ({
      id: String(row.id ?? ""),
      status: typeof row.status === "string" ? row.status : "",
      totalAmount: Number(row.total_amount ?? row.effective_amount ?? 0) || 0,
      settlementDate: typeof row.settlement_date === "string" ? row.settlement_date : typeof row.settled_at === "string" ? row.settled_at : null,
    }));
  } catch {
    return [];
  }
}

/**
 * Creates a subscription plan (POST /plan) and returns its plan_code. Paystack charges subscribers the amount of the
 * plan they subscribed to, so a new price is a new plan (Admin › Pricing › Plans).
 */
export async function createPaystackPlan(input: { name: string; amountKobo: number; interval: "monthly" | "annually"; description?: string }) {
  const response = await fetch(`${PAYSTACK_BASE}/plan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name.slice(0, 100), amount: input.amountKobo, interval: input.interval, currency: "NGN", ...(input.description ? { description: input.description } : {}) }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string; data?: { plan_code?: unknown } } | null;
  const code = typeof json?.data?.plan_code === "string" ? json.data.plan_code : null;
  if (!response.ok || !json?.status || !code || !/^PLN_[A-Za-z0-9]+$/.test(code)) throw new Error(json?.message ?? "Paystack could not create the plan.");
  return code;
}

/**
 * Changes a plan's amount at Paystack. With update_existing_subscriptions, everyone already on the plan pays the new
 * amount from their next renewal.
 */
export async function updatePaystackPlanAmount(code: string, amountKobo: number) {
  const response = await fetch(`${PAYSTACK_BASE}/plan/${encodeURIComponent(code)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountKobo, update_existing_subscriptions: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => null)) as { status?: boolean; message?: string } | null;
  if (!response.ok || !json?.status) throw new Error(json?.message ?? `Paystack could not update plan ${code}.`);
}
