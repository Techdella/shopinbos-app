import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { triggerAutomations } from "@/lib/automations/engine";
import { notifyOrderCustomer } from "@/lib/notifications/customer-messages";
import { statusWhenMarkedPaid } from "@shared/sales";
import { recoverExpiredOrderPayment, releaseOrderDiscount, releaseOrderStock } from "@/lib/commerce/order-expiry.server";
import { cancelSupplierOrdersFor, ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";

// Changing a retail order's status: PATCH /api/app/orders/[id] (web + mobile) and Peggy's mark_order tool
// share these rules so an order moves the same way whoever moves it.

const STATUS_EVENTS: Record<string, string> = {
  processing: "order_processing",
  packed: "order_packed",
  shipped: "order_shipped",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

export const OrderStatusUpdateSchema = z.object({
  // "paid" is the seller confirming cash, transfer or POS for an unpaid order (e.g. a recorded sale).
  status: z.enum(["paid", "processing", "packed", "shipped", "delivered", "cancelled"]),
  paymentMethod: z.enum(["transfer", "cash", "pos"]).optional(),
  notes: z.string().optional(),
  trackingCode: z.string().optional(),
  logisticsType: z.enum(["personal", "network", "pickup"]).optional(),
  logisticsDetails: z.record(z.string(), z.unknown()).optional(),
});
export type OrderStatusUpdate = z.infer<typeof OrderStatusUpdateSchema>;

type Order = NonNullable<Awaited<ReturnType<typeof db.retailOrder.findFirst>>>;

export type OrderStatusResult = { ok: true; order: Order } | { ok: false; error: string };

/** Applies a status change to an order already known to belong to `store`. */
export async function updateOrderStatus(
  store: { id: string; name: string },
  order: Order,
  input: OrderStatusUpdate,
): Promise<OrderStatusResult> {
  const updateData: Record<string, unknown> = { status: input.status };
  if (input.status === "paid" && order.status === "cancelled" && order.expiredAt) {
    // The buyer's transfer came in after the order expired unpaid: take the stock again if it's still there.
    const outcome = await recoverExpiredOrderPayment(order.id, { paymentMethod: input.paymentMethod ?? order.paymentMethod ?? "transfer" });
    if (outcome === "needs_refund") return { ok: false, error: "This order expired unpaid and its items have since sold. Refund the buyer or offer a replacement." };
    const reinstated = await db.retailOrder.findUnique({ where: { id: order.id } });
    return reinstated ? { ok: true, order: reinstated } : { ok: false, error: "Order not found" };
  }
  if (input.status === "paid") {
    if (order.status !== "pending" && order.status !== "awaiting_payment") return { ok: false, error: "This order is already paid" };
    const status = statusWhenMarkedPaid(order.logisticsDetails);
    updateData.status = status;
    updateData.paymentMethod = input.paymentMethod ?? order.paymentMethod ?? "transfer";
    if (status === "delivered") updateData.deliveredAt = new Date();
  }
  // An order with supplier parcels and lines the seller sends themselves: "sent" / "delivered" is the seller's own
  // part, and the order follows all its parts (shipped only when every parcel has left).
  if (input.status === "shipped" || input.status === "delivered") {
    const { markOwnPart } = await import("@/lib/supplier-orders/parts.server");
    const own = await markOwnPart(order.id, input.status, { trackingCode: input.trackingCode, notes: input.notes, logisticsType: input.logisticsType, logisticsDetails: input.logisticsDetails });
    if (own) return { ok: true, order: own };
  }
  if (input.notes) updateData.notes = input.notes;
  if (input.trackingCode) updateData.trackingCode = input.trackingCode;
  if (input.logisticsType) updateData.logisticsDetails = { type: input.logisticsType, ...(input.logisticsDetails || {}) };
  if (input.status === "shipped") updateData.shippedAt = new Date();
  if (input.status === "delivered") updateData.deliveredAt = new Date();

  let updated: Order;
  if (input.status === "paid") {
    // Conditional on still being unpaid, so it can't race the unpaid-order expiry (which gives the stock back).
    const moved = await db.retailOrder.updateMany({ where: { id: order.id, status: { in: ["pending", "awaiting_payment"] } }, data: updateData });
    const current = await db.retailOrder.findUnique({ where: { id: order.id } });
    if (!current) return { ok: false, error: "Order not found" };
    if (moved.count !== 1) {
      if (current.status === "cancelled" && current.expiredAt) return updateOrderStatus(store, current, input);
      return { ok: false, error: "This order is already paid" };
    }
    updated = current;
  } else {
    updated = await db.retailOrder.update({ where: { id: order.id }, data: updateData });
  }

  // Dropship items: paid → their suppliers get orders (idempotent); cancelled → suppliers stop.
  if (input.status === "paid") await ensureSupplierOrdersSafely(order.id);
  if (input.status === "cancelled") {
    await cancelSupplierOrdersFor(order.id).catch((error) => console.error("[orders] could not cancel supplier orders", error));
    // Not sent yet: the stock it held goes back (the store's, or the supplier's for dropship).
    const supplierShipped = await db.supplierOrder.count({ where: { retailOrderId: order.id, status: { in: ["shipped", "delivered"] } } }).catch(() => 0);
    if (!["shipped", "delivered", "returned"].includes(order.status) && supplierShipped === 0) {
      await releaseOrderStock(order.id).catch((error) => console.error("[orders] could not give back stock", error));
    }
    // Cancelled before it was paid: the discount code's use goes back too (once; expiry does the same).
    await releaseOrderDiscount(order, order.status).catch((error) => console.error("[orders] could not give back the discount use", error));
  }

  const event = STATUS_EVENTS[input.status];
  if (event) {
    Promise.allSettled([
      triggerAutomations(event, {
        storeId: store.id,
        storeName: store.name,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName,
        orderNumber: order.orderNumber,
        orderTotal: Number(order.total),
        currency: order.currency,
      }),
    ]).catch(() => {});
  }

  // WhatsApp/SMS to the buyer for paid / shipped / delivered, if the seller switched it on (Marketing › Order messages).
  await notifyOrderCustomer(order.id, input.status);

  return { ok: true, order: updated };
}
