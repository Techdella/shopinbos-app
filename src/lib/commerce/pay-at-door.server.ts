import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { paystackOutcome } from "@shared/paystack-return";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { splitPlanForOrder } from "@/lib/wallet/wallet.server";
import { paystackSplitParams, readSplitPlan } from "@/lib/wallet/rules";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { PAY_AT_DOOR_CHANNELS, PAY_AT_DOOR_PREFIX, payAtDoorDue, payAtDoorPaid } from "@shared/pay-at-door";

// Pay on delivery without cash (rules in shared/pay-at-door.ts). At the door the customer opens their order page
// (from the SMS, or the QR code on the rider's phone) and pays the order in the app: a Paystack payment under its
// own reference (PAY_AT_DOOR_PREFIX), split like a card checkout so each business's share settles to its own bank.
// Only Paystack's verified reply records it, once; then the customer gets the delivery code (on the page and by
// SMS) and the rider can close the drop with it. A fake transfer alert never produces a code.

const ORDER_SELECT = {
  id: true, storeId: true, orderNumber: true, status: true, total: true, shippingFee: true, currency: true, items: true, buyerEmail: true, buyerName: true,
  paymentMethod: true, paystackStatus: true, paystackRef: true, paymentSplit: true,
  store: { select: { id: true, slug: true, name: true, userId: true, customDomain: true } },
} as const;

function loadOrder(orderId: string) {
  return db.retailOrder.findUnique({ where: { id: orderId }, select: ORDER_SELECT });
}

/** What the customer's order page shows for a pay-on-delivery order: naira. null for any other order. */
export function payAtDoorView(order: { paymentMethod: string | null; status: string; paystackStatus: string | null; total: number }) {
  if (order.paymentMethod !== "pay_on_delivery") return null;
  const paid = payAtDoorPaid(order);
  return { amount: Number(order.total), paid, due: payAtDoorDue(order), canPay: payAtDoorDue(order) && paystackSecretReady(process.env.PAYSTACK_SECRET_KEY) };
}

/** The order page link the customer pays from (the SMS and the rider's QR code). */
export async function payAtDoorUrl(orderId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, store: { select: { slug: true, customDomain: true } } } });
  return order ? buildStorefrontUrl(order.store, `/order/${order.id}#pay`) : null;
}

export type StartPayAtDoorResult = { ok: true; authorizationUrl: string; reference: string } | { ok: false; error: string };

/** The customer's "Pay now" at the door: a Paystack payment of the order, split to each business's own bank. */
export async function startPayAtDoor(orderId: string): Promise<StartPayAtDoorResult> {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return { ok: false, error: "Payments in the app aren't available right now. Try again in a moment." };
  const order = await loadOrder(orderId);
  if (!order) return { ok: false, error: "We couldn't find this order." };
  if (payAtDoorPaid(order)) return { ok: false, error: "This order is already paid." };
  if (!payAtDoorDue(order)) return { ok: false, error: "There's nothing to pay on this order." };
  // Checked tries per order, so the link can't be used to hammer Paystack.
  if (!(await checkRateLimitShared(rateLimitKey("pay-at-door", order.id), { maxRequests: 20, windowMs: 15 * 60_000 })).allowed) {
    return { ok: false, error: "Too many tries. Wait a few minutes, then try again." };
  }
  const plan = await splitPlanForOrder(order.storeId, order.items, Number(order.total), "paystack", Number(order.shippingFee ?? 0), order.id);
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
    await db.retailOrder.update({ where: { id: order.id }, data: { paymentSplit: JSON.parse(JSON.stringify(plan)) } });
    return { ok: true, authorizationUrl: started.authorization_url, reference: started.reference ?? reference };
  } catch (error) {
    console.error(`[pay at door] could not start order ${order.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

export type ConfirmPayAtDoorResult = { ok: true; fresh: boolean; orderId: string } | { ok: false; error: string; retry?: boolean; pending?: boolean };

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

/**
 * Records a door payment, once: asks Paystack (never the browser or the webhook body), checks it succeeded, was for
 * this order in naira and covered the whole order, then marks it paid (only while it's still due). Then the
 * customer gets the code. Safe from the webhook and the return page at the same time, and on replays.
 */
export async function confirmPayAtDoor(reference: string): Promise<ConfirmPayAtDoorResult> {
  if (!reference.startsWith(PAY_AT_DOOR_PREFIX)) return { ok: false, error: "Not a pay-on-delivery payment." };
  const known = await db.retailOrder.findFirst({ where: { paystackRef: reference }, select: { id: true } });
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
  const owed = readSplitPlan(order.paymentSplit)?.totalKobo ?? Math.round(Number(order.total) * 100);
  if (Math.round(Number(payment.amount)) < owed) {
    console.warn(`[pay at door] ${reference} paid ${payment.amount} kobo, less than order ${order.id}`);
    return { ok: false, error: "The amount paid is less than the order total." };
  }
  // Only a pay-on-delivery order that's still unpaid moves; a pending one is also confirmed ("paid").
  const moved = await db.retailOrder.updateMany({
    where: {
      id: order.id,
      paymentMethod: "pay_on_delivery",
      // NOT IN skips NULL in SQL, so an order with no Paystack status yet is matched on its own.
      OR: [{ paystackStatus: null }, { paystackStatus: { notIn: ["success", "offline"] } }],
      status: { notIn: ["cancelled", "delivered", "returned", "refunded"] },
    },
    data: { paystackStatus: "success", paystackRef: reference, ...(order.status === "pending" || order.status === "awaiting_payment" ? { status: "paid" } : {}) },
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
 * and the customer gets the code for the rider by SMS (it's on their order page too). Never throws.
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
  }
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
 * The payment link by SMS (in the shop's name): when the parcel is out for delivery or at the pickup point, and when
 * the rider taps "Send the link again" (at most 3 an hour per order). Never throws.
 */
export async function sendPayAtDoorLink(orderId: string, options: { resend?: boolean } = {}) {
  try {
    const order = await loadOrder(orderId);
    if (!order || !payAtDoorDue(order)) return { ok: false as const, error: "There's nothing to pay on this order." };
    if (options.resend && !(await checkRateLimitShared(rateLimitKey("pay-at-door-link", order.id), { maxRequests: 3, windowMs: 60 * 60_000 })).allowed) {
      return { ok: false as const, error: "The link was sent a few times already. Show the customer the QR code instead." };
    }
    const { textPayAtDoorLink } = await import("@/lib/notifications/customer-messages");
    const sent = await textPayAtDoorLink(order.id, { resend: options.resend });
    return sent.some((row) => row.ok) ? { ok: true as const } : { ok: false as const, error: "We couldn't text the customer. Show them the QR code instead." };
  } catch (error) {
    console.error(`[pay at door] link for ${orderId} failed`, error);
    return { ok: false as const, error: "We couldn't text the customer. Show them the QR code instead." };
  }
}
