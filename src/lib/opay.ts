import "server-only";
import { opayOk, readOpayStatus, signedBody, type OpayStatus } from "./opay-signature";

// OPay Checkout (Nigeria) with the platform's merchant account: the hosted Cashier for store checkouts, the status
// query that decides whether an order is paid, and refunds. Like Paystack there are no per-store keys.
//
// Env: OPAY_MERCHANT_ID, OPAY_PUBLIC_KEY (creates cashier payments), OPAY_SECRET_KEY (signs status and refund
// calls, and checks callbacks). OPAY_ENV picks the API: "sandbox" or "live". The live site uses live unless
// OPAY_ENV=sandbox says otherwise; everywhere else defaults to sandbox, so a preview never takes real money.

const LIVE_BASE = "https://liveapi.opaycheckout.com";
const SANDBOX_BASE = "https://testapi.opaycheckout.com";

const placeholder = (value: string) => !value || value.includes("your_") || value.includes("your-");

function config() {
  const merchantId = process.env.OPAY_MERCHANT_ID?.trim() ?? "";
  const publicKey = process.env.OPAY_PUBLIC_KEY?.trim() ?? "";
  const secretKey = process.env.OPAY_SECRET_KEY?.trim() ?? "";
  return { merchantId, publicKey, secretKey };
}

/** All three OPay keys are set (not the .env.local.example placeholders). */
export function opayReady() {
  const { merchantId, publicKey, secretKey } = config();
  return !placeholder(merchantId) && !placeholder(publicKey) && !placeholder(secretKey);
}

/** The secret key, for checking callback signatures; null when OPay isn't set up. */
export function opaySecretKey() {
  return opayReady() ? config().secretKey : null;
}

export function opayBase() {
  // Tests only: OPAY_API_BASE_URL points these calls at a local stub. Ignored on the live site.
  const stub = process.env.VERCEL_ENV !== "production" ? process.env.OPAY_API_BASE_URL?.trim() : "";
  if (stub && /^https?:\/\//.test(stub)) return stub.replace(/\/+$/, "");
  const env = process.env.OPAY_ENV?.trim().toLowerCase();
  if (env === "live") return LIVE_BASE;
  if (env === "sandbox") return SANDBOX_BASE;
  return process.env.VERCEL_ENV === "production" ? LIVE_BASE : SANDBOX_BASE;
}

function keys() {
  if (!opayReady()) throw new Error("OPay is not configured.");
  return config();
}

interface OpayReply {
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
}

async function post(path: string, body: string, bearer: string, merchantId: string, timeoutMs: number): Promise<{ ok: boolean; json: OpayReply | null }> {
  const response = await fetch(`${opayBase()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, MerchantId: merchantId, "Content-Type": "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { ok: response.ok, json: (await response.json().catch(() => null)) as OpayReply | null };
}

function minor(value: unknown) {
  const amount = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const total = typeof amount.total === "number" ? amount.total : Number(amount.total);
  return { total: Number.isFinite(total) ? total : null, currency: typeof amount.currency === "string" ? amount.currency : null };
}

export interface OpayCashierInput {
  /** Our reference: the RetailOrder id, so the status query and callbacks name the order. */
  reference: string;
  amountKobo: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  /** Shown on OPay's page as the merchant (the store's name). */
  displayName: string;
  productName: string;
  productDescription: string;
  /** Minutes the cashier stays open (OPay's default is 30). */
  expireAt: number;
  user: { id?: string; name?: string; email?: string; phone?: string };
  clientIp?: string;
}

/** Opens a hosted OPay Cashier payment (Bearer public key). Returns the URL to send the shopper to. */
export async function createOpayCashier(input: OpayCashierInput) {
  const { merchantId, publicKey } = keys();
  const payload = {
    country: "NG",
    reference: input.reference,
    amount: { total: input.amountKobo, currency: input.currency },
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    callbackUrl: input.callbackUrl,
    displayName: input.displayName.slice(0, 60),
    expireAt: input.expireAt,
    customerVisitSource: "BROWSER",
    ...(input.clientIp ? { userClientIP: input.clientIp } : {}),
    userInfo: {
      ...(input.user.id ? { userId: input.user.id } : {}),
      ...(input.user.name ? { userName: input.user.name.slice(0, 60) } : {}),
      ...(input.user.email ? { userEmail: input.user.email } : {}),
      ...(input.user.phone ? { userMobile: input.user.phone } : {}),
    },
    product: { name: input.productName.slice(0, 100), description: input.productDescription.slice(0, 200) },
  };
  const { ok, json } = await post("/api/v1/international/cashier/create", JSON.stringify(payload), publicKey, merchantId, 20_000);
  const cashierUrl = typeof json?.data?.cashierUrl === "string" ? json.data.cashierUrl : "";
  if (!ok || !opayOk(json?.code) || !/^https:\/\//.test(cashierUrl)) {
    throw new Error(json?.message ? `OPay: ${json.message} (${json.code ?? "no code"})` : "OPay could not start this payment.");
  }
  return { cashierUrl, orderNo: typeof json?.data?.orderNo === "string" ? json.data.orderNo : null };
}

export interface OpayPayment {
  reference: string | null;
  orderNo: string | null;
  status: OpayStatus | null;
  /** Minor units (kobo). */
  amount: number | null;
  currency: string | null;
  failureReason: string | null;
}

/**
 * Asks OPay what happened to a payment (signed). This, not the callback body, is what marks an order paid.
 * Returns null when OPay has no such payment; throws when OPay can't be reached or refuses the call.
 */
export async function queryOpayPayment(reference: string): Promise<OpayPayment | null> {
  const { merchantId, secretKey } = keys();
  const { body, signature } = signedBody({ country: "NG", reference }, secretKey);
  const { ok, json } = await post("/api/v1/international/cashier/status", body, signature, merchantId, 15_000);
  if (json?.code === "00012" || json?.code === "02812" || json?.code === "02006") return null;
  if (!ok || !opayOk(json?.code) || !json?.data) {
    throw new Error(json?.message ? `OPay: ${json.message} (${json.code ?? "no code"})` : "OPay could not check this payment.");
  }
  const data = json.data;
  const amount = minor(data.amount);
  return {
    reference: typeof data.reference === "string" ? data.reference : null,
    orderNo: typeof data.orderNo === "string" ? data.orderNo : null,
    status: readOpayStatus(data.status),
    amount: amount.total,
    currency: amount.currency,
    failureReason: typeof data.failureReason === "string" ? data.failureReason : null,
  };
}

export interface OpayRefundResult {
  ok: boolean;
  /** OPay's refund order number, saved as RetailOrder.refundId. */
  orderNo: string | null;
  status: OpayStatus | null;
  message: string;
}

/** Refunds a whole payment to where it came from (refundWay Original). Never throws. */
export async function createOpayRefund(input: { reference: string; originalReference: string; amountKobo: number; currency: string; callbackUrl: string; reason: string }): Promise<OpayRefundResult> {
  try {
    const { merchantId, secretKey } = keys();
    const { body, signature } = signedBody({
      country: "NG",
      reference: input.reference,
      originalReference: input.originalReference,
      refundWay: "Original",
      amount: { total: input.amountKobo, currency: input.currency },
      callbackUrl: input.callbackUrl,
      refundReason: input.reason.slice(0, 120),
    }, secretKey);
    const { ok, json } = await post("/api/v1/international/payment/refund/create", body, signature, merchantId, 15_000);
    const message = json?.message ?? "OPay did not accept the refund.";
    if (!ok || !opayOk(json?.code) || !json?.data) return { ok: false, orderNo: null, status: null, message: `${message} (${json?.code ?? "no code"})`.slice(0, 300) };
    return {
      ok: true,
      orderNo: typeof json.data.orderNo === "string" ? json.data.orderNo : null,
      status: readOpayStatus(json.data.orderStatus ?? json.data.status),
      message,
    };
  } catch (error) {
    return { ok: false, orderNo: null, status: null, message: error instanceof Error ? error.message : "OPay could not be reached" };
  }
}
