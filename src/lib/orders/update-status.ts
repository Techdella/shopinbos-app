import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { triggerAutomations } from "@/lib/automations/engine";
import { statusWhenMarkedPaid } from "@shared/sales";

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
  if (input.status === "paid") {
    if (order.status !== "pending" && order.status !== "awaiting_payment") return { ok: false, error: "This order is already paid" };
    const status = statusWhenMarkedPaid(order.logisticsDetails);
    updateData.status = status;
    updateData.paymentMethod = input.paymentMethod ?? order.paymentMethod ?? "transfer";
    if (status === "delivered") updateData.deliveredAt = new Date();
  }
  if (input.notes) updateData.notes = input.notes;
  if (input.trackingCode) updateData.trackingCode = input.trackingCode;
  if (input.logisticsType) updateData.logisticsDetails = { type: input.logisticsType, ...(input.logisticsDetails || {}) };
  if (input.status === "shipped") updateData.shippedAt = new Date();
  if (input.status === "delivered") updateData.deliveredAt = new Date();

  const updated = await db.retailOrder.update({ where: { id: order.id }, data: updateData });

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

  return { ok: true, order: updated };
}
