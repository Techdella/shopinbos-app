"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { resolveIssueWithRefund, sellerSentRefund, type IssueFault } from "@/lib/commerce/order-refunds.server";

// The seller's side of "who pays when things go wrong" (shared/order-refunds.ts): "Refund sent" once they've paid the
// customer from their own bank, and who caused a wrong or damaged item the customer reported.

const FAULTS: IssueFault[] = ["supplier", "partner", "seller"];

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

export async function resolveIssueAction(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const issueId = String(formData.get("issueId") ?? "").trim();
  const [fault, supplierOrderId] = String(formData.get("fault") ?? "").split(":");
  if (!orderId || !issueId) redirect("/home/orders");
  if (!FAULTS.includes(fault as IssueFault)) back(orderId, { ok: false, error: "Pick who caused it." });
  back(orderId, await resolveIssueWithRefund(user, issueId, fault as IssueFault, supplierOrderId || null));
}
