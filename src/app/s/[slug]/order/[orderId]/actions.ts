"use server";

import { db } from "@/lib/db/client";

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

  const already = await db.notification.findFirst({
    where: { userId: order.store.userId, metadata: { path: ["event"], equals: `${TRANSFER_SENT}:${order.id}` } },
    select: { id: true },
  });
  if (already) return { ok: true };

  const amount = new Intl.NumberFormat("en-NG", { style: "currency", currency: order.currency, maximumFractionDigits: 0 }).format(order.total);
  await db.notification.create({
    data: {
      userId: order.store.userId,
      type: "order",
      priority: "warning",
      title: `Transfer sent for ${order.orderNumber}`,
      description: `${order.buyerName} says they sent ${amount} by bank transfer with reference ${order.orderNumber}. Check your account, then mark the order as paid.`,
      link: `/home/orders/${order.id}`,
      actionLabel: "Open order",
      actionUrl: `/home/orders/${order.id}`,
      metadata: { orderId: order.id, event: `${TRANSFER_SENT}:${order.id}` },
    },
  });
  return { ok: true };
}
