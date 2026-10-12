"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { assignPayInToPartner } from "@/lib/logistics/payins.server";
import { ensurePayInAccount } from "@/lib/logistics/paystack-dva";

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
  const admin = await requireRole(["admin"], "/admin/login");
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
  await requireRole(["admin"], "/admin/login");
  const partnerId = String(formData.get("partnerId") ?? "").slice(0, 64);
  const back = `/admin/logistics-partners/${partnerId}`;
  // Clear the back-off so the next attempt runs now.
  await db.partnerPayInAccount.updateMany({ where: { logisticsPartnerId: partnerId, status: { in: ["failed", "unavailable", "pending"] } }, data: { updatedAt: new Date(0) } });
  const account = await ensurePayInAccount(partnerId).catch(() => null);
  revalidatePath(back);
  if (account?.status === "assigned") redirect(withNotice(back, "saved", "Pay-in account ready."));
  redirect(withNotice(back, "error", account?.lastError ? `Not ready yet: ${account.lastError}` : "Not ready yet. Check that Paystack keys are set, dedicated accounts are switched on for the business, and the partner is verified."));
}
