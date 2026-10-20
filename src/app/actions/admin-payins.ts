"use server";

import { requireAdminSection } from "@/lib/admin-team/service.server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { assignPayInToPartner } from "@/lib/logistics/payins.server";
import { ensurePayInAccount } from "@/lib/logistics/paystack-dva";
import { markPayInSettled, recordTeamPayIn, unpausePartner } from "@/lib/logistics/payin-admin.server";

// Admin: delivery partners' pay-ins (lib/logistics/payins.server.ts). Assign a transfer we couldn't match to a
// partner, and set up (or retry) a partner's own pay-in account.

function safeReturn(value: FormDataEntryValue | null, fallback: string) {
  const path = String(value ?? "");
  return path.startsWith("/admin/") && !path.startsWith("//") ? path : fallback;
}

function withNotice(path: string, key: "saved" | "error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

export async function assignUnmatchedPayIn(formData: FormData) {
  const admin = await requireAdminSection("money");
  const back = safeReturn(formData.get("returnTo"), "/admin/logistics-partners");
  const payInId = String(formData.get("payInId") ?? "").slice(0, 64);
  const partnerId = String(formData.get("partnerId") ?? "").slice(0, 64);
  if (!payInId || !partnerId) redirect(withNotice(back, "error", "Pick a delivery partner for this payment."));

  const result = await assignPayInToPartner({ payInId, partnerId, adminUserId: admin.id });
  revalidatePath("/admin/logistics-partners");
  revalidatePath(`/admin/logistics-partners/${partnerId}`);
  if (!result.ok) redirect(withNotice(back, "error", result.error));
  redirect(withNotice(back, "saved", "Payment assigned. The partner has been told."));
}

export async function setUpPayInAccount(formData: FormData) {
  await requireAdminSection("money");
  const partnerId = String(formData.get("partnerId") ?? "").slice(0, 64);
  const back = `/admin/logistics-partners/${partnerId}`;
  // Clear the back-off so the next attempt runs now.
  await db.partnerPayInAccount.updateMany({ where: { logisticsPartnerId: partnerId, status: { in: ["failed", "unavailable", "pending"] } }, data: { updatedAt: new Date(0) } });
  const account = await ensurePayInAccount(partnerId).catch(() => null);
  revalidatePath(back);
  if (account?.status === "assigned") redirect(withNotice(back, "saved", "Pay-in account ready."));
  redirect(withNotice(back, "error", account?.lastError ? `Not ready yet: ${account.lastError}` : "Not ready yet. Check that Paystack keys are set, dedicated accounts are switched on for the business, and the partner is verified."));
}

// Late pay-ins (lib/logistics/payin-admin.server.ts): "Mark as settled" with a reason, "Unpause", and a pay-in the
// team records for a partner.

function partnerBack(formData: FormData, partnerId: string) {
  return safeReturn(formData.get("returnTo"), `/admin/logistics-partners/${partnerId}`);
}

export async function markLatePayInSettled(formData: FormData) {
  const admin = await requireAdminSection("money");
  const partnerId = String(formData.get("partnerId") ?? "").slice(0, 64);
  const back = partnerBack(formData, partnerId);
  const reason = String(formData.get("reason") ?? "");
  const result = await markPayInSettled({ partnerId, reason, adminUserId: admin.id });
  revalidatePath("/admin/logistics-partners");
  revalidatePath(`/admin/logistics-partners/${partnerId}`);
  redirect(withNotice(back, result.ok ? "saved" : "error", result.ok ? result.message : result.error));
}

export async function unpauseLatePartner(formData: FormData) {
  const admin = await requireAdminSection("money");
  const partnerId = String(formData.get("partnerId") ?? "").slice(0, 64);
  const back = partnerBack(formData, partnerId);
  const result = await unpausePartner({ partnerId, adminUserId: admin.id, reason: String(formData.get("reason") ?? "") });
  revalidatePath("/admin/logistics-partners");
  revalidatePath(`/admin/logistics-partners/${partnerId}`);
  redirect(withNotice(back, result.ok ? "saved" : "error", result.ok ? result.message : result.error));
}

export async function recordPartnerPayInByTeam(formData: FormData) {
  const admin = await requireAdminSection("money");
  const partnerId = String(formData.get("partnerId") ?? "").slice(0, 64);
  const back = partnerBack(formData, partnerId);
  const amount = Number(String(formData.get("amount") ?? "").replace(/[₦,\s]/g, ""));
  const method = String(formData.get("method") ?? "transfer") === "cash" ? "cash" : "transfer";
  if (!Number.isFinite(amount) || amount <= 0) redirect(withNotice(back, "error", "Enter the amount they paid in."));
  const result = await recordTeamPayIn({ partnerId, amount, method, note: String(formData.get("note") ?? "").slice(0, 300), adminUserId: admin.id });
  revalidatePath("/admin/logistics-partners");
  revalidatePath(`/admin/logistics-partners/${partnerId}`);
  redirect(withNotice(back, result.ok ? "saved" : "error", result.ok ? result.message : result.error));
}
