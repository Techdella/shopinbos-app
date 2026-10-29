"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { sellerResendRefund, sellerSentRefund } from "@/lib/commerce/order-refunds.server";

// The seller's side of a guided refund (shared/order-refunds.ts): "Refund sent" once they've paid the customer from
// their own bank.

function back(orderId: string, result: { ok: true; message: string } | { ok: false; error: string }): never {
  revalidatePath(`/home/orders/${orderId}`);
  const query = result.ok ? `refundSaved=${encodeURIComponent(result.message)}` : `refundError=${encodeURIComponent(result.error)}`;
  redirect(`/home/orders/${encodeURIComponent(orderId)}?${query}#refunds`);
}

export async function markRefundSentAction(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const refundId = String(formData.get("refundId") ?? "").trim();
  if (!orderId || !refundId) redirect("/home/orders");
  back(orderId, await sellerSentRefund(user.id, refundId, String(formData.get("reference") ?? "")));
}


export async function resendRefundAction(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const refundId = String(formData.get("refundId") ?? "").trim();
  if (!orderId || !refundId) redirect("/home/orders");
  back(orderId, await sellerResendRefund(user.id, refundId));
}
