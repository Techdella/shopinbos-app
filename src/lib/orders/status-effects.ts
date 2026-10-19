import "server-only";
import { triggerAutomations } from "@/lib/automations/engine";
import { notifyOrderCustomer } from "@/lib/notifications/customer-messages";

// What follows an order status change: the seller's automations (emails and flows) and the customer's WhatsApp/SMS
// order message. Shared by updateOrderStatus (the seller, Peggy, delivery jobs) and the parts recompute
// (src/lib/supplier-orders/parts.server.ts), so a mixed order only says "shipped" once every parcel has left.

export const STATUS_EVENTS: Record<string, string> = {
  processing: "order_processing",
  packed: "order_packed",
  shipped: "order_shipped",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

export async function orderStatusSideEffects(
  store: { id: string; name: string },
  order: { id: string; buyerEmail: string; buyerName: string; orderNumber: string; total: number | string; currency: string },
  status: string,
) {
  const event = STATUS_EVENTS[status];
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
  await notifyOrderCustomer(order.id, status);
}
