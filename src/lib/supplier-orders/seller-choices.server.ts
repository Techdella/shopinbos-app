import "server-only";
import { db } from "@/lib/db/client";
import { refundCancelledOrder } from "@/lib/commerce/refunds.server";
import { updateOrderStatus } from "@/lib/orders/update-status";
import { activeReplacement } from "@shared/order-parts";

// What a seller can do when a supplier didn't accept in time and nobody took it over (or they undid the switch):
// "Find another supplier" (a search, web /marketplace or the app's Find products) or "Cancel and refund the
// customer" (this). Shared by the web order page (supplier-actions.ts) and the app (/api/app/orders/[id]/...).
// Always scoped to the seller's own store.

export type ChoiceResult = { ok: true; message: string } | { ok: false; code: "NOT_FOUND" | "CONFLICT"; message: string };

export async function cancelAndRefundAfterExpiry(store: { id: string; name: string }, orderId: string): Promise<ChoiceResult> {
  const order = orderId ? await db.retailOrder.findFirst({ where: { id: orderId, storeId: store.id } }) : null;
  if (!order) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  const rows = await db.supplierOrder.findMany({ where: { retailOrderId: order.id, storeId: store.id }, select: { id: true, status: true, replacesId: true } });
  const waiting = rows.some((row) => row.status === "expired" && !activeReplacement(rows, row.id));
  if (!waiting) return { ok: false, code: "CONFLICT", message: "No supplier ran out of time on this order." };
  if (["shipped", "delivered", "cancelled", "refunded", "returned"].includes(order.status)) {
    return { ok: false, code: "CONFLICT", message: "This order has already moved on, so it can't be cancelled here." };
  }
  const result = await updateOrderStatus(store, order, { status: "cancelled", notes: order.notes ?? undefined });
  if (!result.ok) return { ok: false, code: "CONFLICT", message: result.error };
  const refund = await refundCancelledOrder(order.id, "Cancelled because the supplier didn't accept it in time.");
  const message =
    refund === "manual"
      ? "Cancelled. The customer paid you directly, so send their money back by transfer."
      : refund === "failed"
        ? "Cancelled, but the refund didn't go through. Refund the customer from Paystack or by transfer."
        : refund === "skipped"
          ? "Cancelled. The customer hadn't paid yet, so there's nothing to refund."
          : "Cancelled. The customer's money is on its way back to them.";
  return { ok: true, message };
}
