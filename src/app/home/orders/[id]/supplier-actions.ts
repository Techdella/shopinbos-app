"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { updateOrderStatus } from "@/lib/orders/update-status";
import { refundCancelledOrder } from "@/lib/commerce/refunds.server";

// The seller's choice when a supplier didn't accept their order in time (src/lib/supplier-orders/acceptance.server.ts):
// "Find another supplier" is a link; "Cancel and refund the customer" is this action. The stock goes back through
// the normal cancel (once), and the money through the refund path (Paystack, or flagged to refund by hand).

export async function cancelAndRefundExpiredOrder(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const back = (query: string) => `/home/orders/${encodeURIComponent(orderId)}?${query}#supplier-orders`;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  const order = store && orderId ? await db.retailOrder.findFirst({ where: { id: orderId, storeId: store.id } }) : null;
  if (!store || !order) redirect("/home/orders");
  const expired = await db.supplierOrder.count({ where: { retailOrderId: order.id, status: "expired" } });
  if (!expired) redirect(back(`error=${encodeURIComponent("No supplier ran out of time on this order.")}`));
  if (["shipped", "delivered", "cancelled", "refunded", "returned"].includes(order.status)) {
    redirect(back(`error=${encodeURIComponent("This order has already moved on, so it can't be cancelled here.")}`));
  }
  const result = await updateOrderStatus(store, order, { status: "cancelled", notes: order.notes ?? undefined });
  if (!result.ok) redirect(back(`error=${encodeURIComponent(result.error)}`));
  const refund = await refundCancelledOrder(order.id, "Cancelled because the supplier didn't accept it in time.");
  revalidatePath(`/home/orders/${order.id}`);
  revalidatePath("/home/orders");
  const said = refund === "manual" ? "Cancelled. The customer paid you directly, so send their money back by transfer." : refund === "failed" ? "Cancelled, but the refund didn't go through. Refund the customer from Paystack or by transfer." : refund === "skipped" ? "Cancelled. The customer hadn't paid yet, so there's nothing to refund." : "Cancelled. The customer's money is on its way back to them.";
  redirect(back(`saved=${encodeURIComponent(said)}`));
}
