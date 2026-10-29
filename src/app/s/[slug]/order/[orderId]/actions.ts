"use server";

import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";

const TRANSFER_SENT = "transfer_sent";

/**
 * The buyer says they sent the bank transfer for an order. Tells the seller to check their account; the order
 * stays pending until the seller marks it as paid. Only works once per order, so the link can't spam the seller.
 */
export async function notifyTransferSent(orderId: string): Promise<{ ok: boolean; error?: string }> {
  if (typeof orderId !== "string" || orderId.length > 64) return { ok: false, error: "Order not found." };
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, buyerName: true, total: true, currency: true, status: true, paymentMethod: true, store: { select: { userId: true } } },
  });
  if (!order || order.paymentMethod !== "transfer") return { ok: false, error: "Order not found." };
  if (order.status !== "pending" && order.status !== "awaiting_payment") return { ok: true };

  // Older notifications marked the event in metadata; new ones also carry a dedupe key, so this can't spam the seller.
  const already = await db.notification.findFirst({
    where: { userId: order.store.userId, metadata: { path: ["event"], equals: `${TRANSFER_SENT}:${order.id}` } },
    select: { id: true },
  });
  if (already) return { ok: true };

  const amount = new Intl.NumberFormat("en-NG", { style: "currency", currency: order.currency, maximumFractionDigits: 0 }).format(order.total);
  await notify({
    userId: order.store.userId,
    event: "order.transfer_sent",
    dedupeKey: `order.transfer_sent:${order.id}`,
    type: "order",
    priority: "warning",
    title: `Transfer sent for ${order.orderNumber}`,
    description: `${order.buyerName} says they sent ${amount} by bank transfer with reference ${order.orderNumber}. Check your account, then mark the order as paid.`,
    link: `/home/orders/${order.id}`,
    actionLabel: "Open order",
    actionUrl: `/home/orders/${order.id}`,
    metadata: { orderId: order.id, event: `${TRANSFER_SENT}:${order.id}` },
  });
  return { ok: true };
}

/**
 * "Pay the rest" of a preorder paid with a deposit (src/lib/commerce/store-balance.server.ts): starts a Paystack
 * payment of the balance and answers with where to send the shopper; Paystack brings them back to the order page,
 * which confirms the reference with Paystack before anything is recorded. The order id is the shopper's link.
 */
export async function payOrderBalance(orderId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (typeof orderId !== "string" || !orderId || orderId.length > 64) return { ok: false, error: "Order not found." };
  const { startStoreBalancePayment } = await import("@/lib/commerce/store-balance.server");
  const started = await startStoreBalancePayment(orderId);
  return started.ok ? { ok: true, url: started.authorizationUrl } : { ok: false, error: started.error };
}

/**
 * Pay on delivery, at the door (src/lib/commerce/pay-at-door.server.ts): starts the Paystack payment of the order and
 * answers with where to send the customer; Paystack brings them back to the order page, which confirms the reference
 * with Paystack before anything is recorded (and only then shows the code for the rider).
 */
export async function payAtDoor(orderId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (typeof orderId !== "string" || !orderId || orderId.length > 64) return { ok: false, error: "Order not found." };
  const { startPayAtDoor } = await import("@/lib/commerce/pay-at-door.server");
  const started = await startPayAtDoor(orderId);
  return started.ok ? { ok: true, url: started.authorizationUrl } : { ok: false, error: started.error };
}

// ─── Guided refunds (shared/order-refunds.ts) ─────────────────────────────────
// The order's unguessable id is the customer's access, as for the order page itself; each step is checked against it.

const validId = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 64;

/** The customer gives the bank account for their refund (checked with the bank). */
export async function giveRefundAccountAction(orderId: string, refundId: string, input: { bankName: string; accountNumber: string }) {
  if (!validId(orderId) || !validId(refundId)) return { ok: false as const, error: "We couldn't find this refund." };
  const { giveRefundAccount } = await import("@/lib/commerce/order-refunds.server");
  return giveRefundAccount(orderId, refundId, { bankName: String(input?.bankName ?? ""), accountNumber: String(input?.accountNumber ?? "") });
}

/** The customer says the refund arrived, or that it didn't. */
export async function answerRefund(orderId: string, refundId: string, received: boolean, note?: string) {
  if (!validId(orderId) || !validId(refundId)) return { ok: false as const, error: "We couldn't find this refund." };
  const { customerAnswersRefund } = await import("@/lib/commerce/order-refunds.server");
  return customerAnswersRefund(orderId, refundId, received === true, typeof note === "string" ? note : undefined);
}
