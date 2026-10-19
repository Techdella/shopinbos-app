"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { cancelAndRefundAfterExpiry } from "@/lib/supplier-orders/seller-choices.server";
import { undoSupplierSwitch } from "@/lib/supplier-orders/switch.server";
import { getT } from "@/lib/i18n/server";

// The seller's choice when a supplier didn't accept their order in time (src/lib/supplier-orders/acceptance.server.ts):
// "Find another supplier" is a link; "Cancel and refund the customer" is this action. The stock goes back through
// the normal cancel (once), and the money through the refund path (Paystack, or flagged to refund by hand).
// When we sent it to another supplier automatically, "Undo" takes that back until they accept.

export async function cancelAndRefundExpiredOrder(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const back = (query: string) => `/home/orders/${encodeURIComponent(orderId)}?${query}#supplier-orders`;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store || !orderId) redirect("/home/orders");
  const result = await cancelAndRefundAfterExpiry(store, orderId);
  if (!result.ok && result.code === "NOT_FOUND") redirect("/home/orders");
  revalidatePath(`/home/orders/${orderId}`);
  revalidatePath("/home/orders");
  redirect(back(result.ok ? `saved=${encodeURIComponent(result.message)}` : `error=${encodeURIComponent(result.message)}`));
}

export async function undoSupplierSwitchAction(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const replacementId = String(formData.get("supplierOrderId") ?? "").trim();
  const back = (query: string) => `/home/orders/${encodeURIComponent(orderId)}?${query}#supplier-orders`;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store || !orderId || !replacementId) redirect("/home/orders");
  const result = await undoSupplierSwitch(store.id, replacementId);
  revalidatePath(`/home/orders/${orderId}`);
  const t = await getT("orders");
  redirect(back(result.ok ? `saved=${encodeURIComponent(t("detail.undone"))}` : `error=${encodeURIComponent(result.message)}`));
}
