import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { paystackOutcome } from "@shared/paystack-return";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { recordOrderShares, splitPlanForOrder } from "@/lib/wallet/wallet.server";
import { paystackSplitParams, readSplitPlan, type PaymentSplitPlan } from "@/lib/wallet/rules";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import {
  PAY_AT_DOOR_CHANNELS,
  PAY_AT_DOOR_PREFIX,
  POD_FEE_PREFIX,
  doorAmountKobo,
  payAtDoorDue,
  payAtDoorPaid,
  podFeeDue,
  podFeePaid,
} from "@shared/pay-at-door";

// Pay on delivery without cash (rules in shared/pay-at-door.ts), in two payments:
//   1. At checkout, the delivery fee (POD_FEE_PREFIX): split straight to the delivery partner (or the seller for their
//      own delivery), saved as paymentSplit / paystackRef. Once it's in (depositPaidAt) the order goes to its
//      suppliers and delivery partners; until then it waits, and expires like an unpaid card order.
//   2. At the door, the rest (PAY_AT_DOOR_PREFIX): the customer opens their order page (from the SMS or WhatsApp
//      message, or the QR code on the rider's phone) and pays, split like a card order so each business's share
//      settles to its own bank; saved as balanceSplit / balanceRef / balancePaidAt. Then the customer gets the code
//      and the rider can close the drop with it. A fake transfer alert never produces a code.
// Only Paystack's verified reply records either payment, once. Orders with free delivery skip the first payment.

const ORDER_SELECT = {
  id: true, storeId: true, orderNumber: true, status: true, total: true, shippingFee: true, currency: true, items: true, buyerEmail: true, buyerName: true,
  paymentMethod: true, paystackStatus: true, paystackRef: true, paymentSplit: true, paymentDueAt: true, depositPaidAt: true, expiredAt: true,
  balanceSplit: true, balanceRef: true, balancePaidAt: true,
  store: { select: { id: true, slug: true, name: true, userId: true, customDomain: true } },
} as const;

function loadOrder(orderId: string) {
  return db.retailOrder.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
}

const formatNaira = (amount: number, currency = "NGN") => {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `₦${Math.round(amount).toLocaleString("en-NG")}`;
  }
};

const paystackReady = () => paystackSecretReady(process.env.PAYSTACK_SECRET_KEY);

/** The delivery fee charged at checkout, in kobo (its split's total), or 0 when nothing was charged upfront. */
function feeKoboOf(order: { paymentMethod: string | null; status: string; depositPaidAt: Date | null; paymentDueAt: Date | null; paymentSplit: unknown }) {
  return podFeePaid(order) || podFeeDue(order) ? readSplitPlan(order.paymentSplit)?.totalKobo ?? 0 : 0;
}

/** What the customer's order page shows for a pay-on-delivery order, in naira. null for any other order. */
export function payAtDoorView(order: { paymentMethod: string | null; status: string; paystackStatus: string | null; total: number; shippingFee: number; paymentDueAt: Date | null; depositPaidAt: Date | null; paymentSplit: unknown }) {
  if (order.paymentMethod !== "pay_on_delivery") return null;
  const feeDue = podFeeDue(order);
  const due = payAtDoorDue(order);
  const fee = feeKoboOf(order);
  return {
    /** Still to pay at the door. */
    amount: doorAmountKobo(order, fee) / 100,
    /** The delivery fee: paid at checkout (feePaid), or still owed before the order goes ahead (feeDue). */
    fee: fee / 100,
    feePaid: podFeePaid(order),
    feeDue,
    paid: payAtDoorPaid(order),
    due,
    canPay: (due || feeDue) && paystackReady(),
  };
}

/** What the customer pays at the door, in naira (the rider's apps show it). */
export function doorAmountNaira(order: { paymentMethod: string | null; status: string; total: number; depositPaidAt: Date | null; paymentDueAt: Date | null; paymentSplit: unknown }) {
  return doorAmountKobo(order, feeKoboOf(order)) / 100;
}

/** The order page link the customer pays from (the messages and the rider's QR code). */
export async function payAtDoorUrl(orderId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, store: { select: { slug: true, customDomain: true } } } });
  return order ? buildStorefrontUrl(order.store, `/order/${order.id}#pay`) : null;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export type StartPaymentResult = { ok: true; authorizationUrl: string; accessCode: string | null; reference: string } | { ok: false; error: string };

// ─── 1. The delivery fee, at checkout ─────────────────────────────────────────

/**
 * Starts the delivery fee payment of a pay-on-delivery order: at checkout (with the split checkout worked out, which
 * pays each delivery partner directly), or again from the order page if the customer closed Paystack (the saved split).
 */
export async function startPodFee(orderId: string, plan?: PaymentSplitPlan | null): Promise<StartPaymentResult> {
  if (!paystackReady()) return { ok: false, error: "Payments in the app aren't available right now. Try again in a moment." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "We couldn't find this order." };
  if (!podFeeDue(order)) return { ok: false, error: podFeePaid(order) ? "The delivery fee is already paid." : "There's nothing to pay on this order now." };
  const split = plan ?? readSplitPlan(order.paymentSplit);
  if (!split || split.totalKobo <= 0) return { ok: false, error: `${order.store.name} can't take payments in the app right now.` };
  const reference = `${POD_FEE_PREFIX}${randomBytes(9).toString("hex")}`;
  try {
    const started = await initializePaystackTransaction({
      email: order.buyerEmail,
      amountKobo: split.totalKobo,
      reference,
      callbackUrl: buildStorefrontUrl(order.store, `/order/${order.id}`),
      metadata: { kind: "pod_fee", orderId: order.id, orderNumber: order.orderNumber, storeId: order.storeId },
      split: paystackSplitParams(split),
    });
    if (!started.authorization_url) return { ok: false, error: "Paystack couldn't start this payment. Try again." };
    await db.retailOrder.update({ where: { id: order.id }, data: { paystackRef: started.reference ?? reference, paymentSplit: JSON.parse(JSON.stringify(split)) } });
    return { ok: true, authorizationUrl: started.authorization_url, accessCode: started.access_code ?? null, reference: started.reference ?? reference };
  } catch (error) {
    console.error(`[pay on delivery] could not start the delivery fee of order ${order.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

export type ConfirmResult = { ok: true; fresh: boolean; orderId: string } | { ok: false; error: string; retry?: boolean; pending?: boolean };

/**
 * Records the delivery fee, once: verified with Paystack, for this order, the whole fee. The order then goes ahead:
 * suppliers get their orders, delivery partners are booked (a partner paid in this split is marked paid), and each
 * business's share goes on its statement. A fee that arrives after the order expired is flagged for a refund.
 */
export async function confirmPodFee(reference: string): Promise<ConfirmResult> {
  if (!reference.startsWith(POD_FEE_PREFIX)) return { ok: false, error: "Not a delivery fee payment." };
  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (payment.status !== "success") return { ok: false, error: "The payment didn't go through.", pending: paystackOutcome(payment.status) === "pending" };
  if (payment.currency && payment.currency !== "NGN") return { ok: false, error: "This payment wasn't in naira." };
  const meta = readMetadata(payment.metadata);
  const orderId = typeof meta.orderId === "string" ? meta.orderId : "";
  if (meta.kind !== "pod_fee" || !orderId) return { ok: false, error: "This payment isn't a delivery fee." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "We couldn't find this order." };
  if (podFeePaid(order)) return { ok: true, fresh: false, orderId: order.id };
  const owed = readSplitPlan(order.paymentSplit)?.totalKobo;
  if (!owed) return { ok: false, error: "This order has no delivery fee to pay." };
  if (Math.round(Number(payment.amount)) < owed) {
    console.warn(`[pay on delivery] ${reference} paid ${payment.amount} kobo, less than the delivery fee of order ${order.id}`);
    return { ok: false, error: "The amount paid is less than the delivery fee." };
  }
  const moved = await db.retailOrder.updateMany({
    where: { id: order.id, paymentMethod: "pay_on_delivery", depositPaidAt: null, status: { in: ["pending", "awaiting_payment"] } },
    // paymentDueAt off: the order no longer expires, it waits for the door payment like any pay-on-delivery order.
    data: { depositPaidAt: new Date(), paymentDueAt: null, paystackRef: reference },
  });
  if (moved.count !== 1) {
    // Paid after the order expired (or was cancelled): the fee is owed back to the customer.
    await db.retailOrder.updateMany({ where: { id: order.id, paymentIssue: null }, data: { paymentIssue: `The delivery fee (${reference}) was paid after the order was cancelled. Refund the customer.`, refundStatus: "manual" } }).catch(() => null);
    console.warn(`[pay on delivery] fee ${reference} for order ${order.id} arrived when the order was ${order.status}`);
    return { ok: false, error: "This order was cancelled before the fee arrived." };
  }
  await afterPodFeePaid(order.id);
  return { ok: true, fresh: true, orderId: order.id };
}

/** The order goes ahead once the delivery fee is in. Idempotent pieces; never throws. */
async function afterPodFeePaid(orderId: string) {
  const [{ ensureSupplierOrdersSafely }, { settlePaymentLinkForOrder }] = await Promise.all([import("@/lib/supplier-orders/service.server"), import("@/lib/payment-links/service.server")]);
  await ensureSupplierOrdersSafely(orderId);
  await settlePaymentLinkForOrder(orderId).catch((error) => console.error(`[pay on delivery] payment link for ${orderId}`, error));
  await recordOrderShares(orderId);
}

// ─── 2. The rest, at the door ─────────────────────────────────────────────────

/** The customer's "Pay now" at the door: a Paystack payment of the rest, split to each business's own bank. */
export async function startPayAtDoor(orderId: string): Promise<StartPaymentResult> {
  if (!paystackReady()) return { ok: false, error: "Payments in the app aren't available right now. Try again in a moment." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "We couldn't find this order." };
  // The delivery fee first (the order isn't on its way until then).
  if (podFeeDue(order)) return startPodFee(order.id);
  if (payAtDoorPaid(order)) return { ok: false, error: "This order is already paid." };
  if (!payAtDoorDue(order)) return { ok: false, error: "There's nothing to pay on this order." };
  // Checked tries per order, so the link can't be used to hammer Paystack.
  if (!(await checkRateLimitShared(rateLimitKey("pay-at-door", order.id), { maxRequests: 20, windowMs: 15 * 60_000 })).allowed) {
    return { ok: false, error: "Too many tries. Wait a few minutes, then try again." };
  }
  // With the fee paid at checkout, the door payment is the goods (no delivery left in it).
  const feePaid = podFeePaid(order);
  const doorNaira = doorAmountKobo(order, feeKoboOf(order)) / 100;
  const plan = await splitPlanForOrder(order.storeId, order.items, doorNaira, "paystack", feePaid ? 0 : Number(order.shippingFee ?? 0), order.id);
  if (!plan || plan.totalKobo <= 0) return { ok: false, error: `${order.store.name} can't take payments in the app yet. Ask the rider to call the store.` };
  const reference = `${PAY_AT_DOOR_PREFIX}${randomBytes(9).toString("hex")}`;
  try {
    const started = await initializePaystackTransaction({
      email: order.buyerEmail,
      amountKobo: plan.totalKobo,
      reference,
      callbackUrl: buildStorefrontUrl(order.store, `/order/${order.id}`),
      metadata: { kind: "pay_at_door", orderId: order.id, orderNumber: order.orderNumber, storeId: order.storeId },
      split: paystackSplitParams(plan),
      channels: [...PAY_AT_DOOR_CHANNELS],
    });
    if (!started.authorization_url) return { ok: false, error: "Paystack couldn't start this payment. Try again." };
    // The split this payment settles by: recorded on the wallets once it's confirmed (recordOrderShares).
    await db.retailOrder.update({ where: { id: order.id }, data: { balanceSplit: JSON.parse(JSON.stringify(plan)) } });
    return { ok: true, authorizationUrl: started.authorization_url, accessCode: started.access_code ?? null, reference: started.reference ?? reference };
  } catch (error) {
    console.error(`[pay at door] could not start order ${order.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

/**
 * Records a door payment, once: asks Paystack (never the browser or the webhook body), checks it succeeded, was for
 * this order in naira and covered the rest, then marks it paid (only while it's still due). Then the customer gets
 * the code. Safe from the webhook and the return page at the same time, and on replays.
 */
export async function confirmPayAtDoor(reference: string): Promise<ConfirmResult> {
  if (!reference.startsWith(PAY_AT_DOOR_PREFIX)) return { ok: false, error: "Not a pay-on-delivery payment." };
  const known = await db.retailOrder.findUnique({ where: { balanceRef: reference }, select: { id: true } });
  if (known) return { ok: true, fresh: false, orderId: known.id };
  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (payment.status !== "success") return { ok: false, error: "The payment didn't go through.", pending: paystackOutcome(payment.status) === "pending" };
  if (payment.currency && payment.currency !== "NGN") return { ok: false, error: "This payment wasn't in naira." };
  const meta = readMetadata(payment.metadata);
  const orderId = typeof meta.orderId === "string" ? meta.orderId : "";
  if (meta.kind !== "pay_at_door" || !orderId) return { ok: false, error: "This payment isn't for a pay-on-delivery order." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "We couldn't find this order." };
  const owed = readSplitPlan(order.balanceSplit)?.totalKobo ?? doorAmountKobo(order, feeKoboOf(order));
  if (Math.round(Number(payment.amount)) < owed) {
    console.warn(`[pay at door] ${reference} paid ${payment.amount} kobo, less than order ${order.id}`);
    return { ok: false, error: "The amount paid is less than what's due." };
  }
  // Only a pay-on-delivery order that's still unpaid moves; a pending one is also confirmed ("paid").
  const moved = await db.retailOrder.updateMany({
    where: {
      id: order.id,
      paymentMethod: "pay_on_delivery",
      balancePaidAt: null,
      // NOT IN skips NULL in SQL, so an order with no Paystack status yet is matched on its own.
      OR: [{ paystackStatus: null }, { paystackStatus: { notIn: ["success", "offline"] } }],
      status: { notIn: ["cancelled", "delivered", "returned", "refunded"] },
    },
    data: {
      paystackStatus: "success",
      balanceRef: reference,
      balancePaidAt: new Date(),
      balancePaidVia: "paystack",
      ...(order.status === "pending" || order.status === "awaiting_payment" ? { status: "paid" } : {}),
    },
  });
  if (moved.count !== 1) {
    // Paid twice (two phones), or after the order closed: the money is in Paystack and the seller sees it there.
    console.warn(`[pay at door] ${reference} for order ${order.id} arrived when nothing was due`);
    return { ok: false, error: "This order was already paid or closed." };
  }
  await afterPaidAtDoor(order.id);
  return { ok: true, fresh: true, orderId: order.id };
}

/**
 * Once the money is in: the seller and customer hear (the usual "payment received"), the shares go on the wallets,
 * and the customer gets the code for the rider by SMS and WhatsApp (it's on their order page too). Never throws.
 */
async function afterPaidAtDoor(orderId: string) {
  try {
    const { afterRetailOrderPaid } = await import("@/lib/commerce/order-paid.server");
    await afterRetailOrderPaid(orderId, true, "pay at door");
  } catch (error) {
    console.error(`[pay at door] follow-up for ${orderId} failed`, error);
  }
  const codes = await deliveryCodesFor(orderId).catch(() => []);
  if (codes.length) {
    const { textPayAtDoorCode } = await import("@/lib/notifications/customer-messages");
    await textPayAtDoorCode(orderId, codes).catch(() => null);
    await emailPayAtDoorCode(orderId, codes).catch((error) => console.error(`[pay at door] code email for ${orderId} failed`, error));
  }
}

/** The code by email too, when the customer gave one at checkout (they show it to the rider from any of them). */
async function emailPayAtDoorCode(orderId: string, codes: string[]) {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerEmail: true, store: { select: { slug: true, customDomain: true } } } });
  const to = order?.buyerEmail?.trim();
  if (!order || !to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  const { sendPayAtDoorCodeEmail } = await import("@/lib/email/notices.server");
  await sendPayAtDoorCodeEmail({ store: order.storeId, to, buyerName: order.buyerName, orderNumber: order.orderNumber, codes, orderUrl: buildStorefrontUrl(order.store, `/order/${order.id}`) });
}

/** The codes for the order's parcels on their way (one per delivery job that isn't closed). */
export async function deliveryCodesFor(orderId: string) {
  const jobs = await db.deliveryBooking.findMany({
    where: { orderId, replacedById: null, deliveryCode: { not: null }, status: { notIn: ["cancelled", "delivered", "failed", "returned"] } },
    orderBy: { createdAt: "asc" },
    select: { deliveryCode: true },
  });
  return [...new Set(jobs.map((job) => job.deliveryCode!).filter(Boolean))];
}

/**
 * The payment link by SMS and WhatsApp (in the shop's name, with what's left to pay): when the parcel is out for delivery or at the pickup
 * point, and when the rider taps "Send the link again" (at most 3 an hour per order). Never throws.
 */
export async function sendPayAtDoorLink(orderId: string, options: { resend?: boolean } = {}) {
  try {
    const order = await loadOrder(orderId);
    if (!order || !payAtDoorDue(order)) return { ok: false as const, error: "There's nothing to pay on this order." };
    if (options.resend && !(await checkRateLimitShared(rateLimitKey("pay-at-door-link", order.id), { maxRequests: 3, windowMs: 60 * 60_000 })).allowed) {
      return { ok: false as const, error: "The link was sent a few times already. Show the customer the QR code instead." };
    }
    const { textPayAtDoorLink } = await import("@/lib/notifications/customer-messages");
    const amount = formatNaira(doorAmountKobo(order, feeKoboOf(order)) / 100, order.currency);
    const sent = await textPayAtDoorLink(order.id, { amount, resend: options.resend });
    return sent.some((row) => row.ok) ? { ok: true as const } : { ok: false as const, error: "We couldn't text the customer. Show them the QR code instead." };
  } catch (error) {
    console.error(`[pay at door] link for ${orderId} failed`, error);
    return { ok: false as const, error: "We couldn't text the customer. Show them the QR code instead." };
  }
}
