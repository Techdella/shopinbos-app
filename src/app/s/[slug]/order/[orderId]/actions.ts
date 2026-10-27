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
