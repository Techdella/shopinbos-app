"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { logDataAccess } from "@/lib/admin/data-access.server";
import { setShopStatus } from "@/lib/admin/sellers.server";
import { sendNotificationOnWhatsApp } from "@/lib/notifications/notify.server";
import { db } from "@/lib/db/client";
import { asRevealReason, asShopActionReason } from "@shared/privacy";

// Admin › Sellers. Each action is logged (AdminDataAccess) with the reason before anything is shown or changed.

/** Show a seller's contact details: logged with the reason, then shown on this admin's page for a few minutes. */
export async function revealSellerContact(formData: FormData) {
  const admin = await requireAdminSection("partners");
  const storeId = String(formData.get("storeId") ?? "");
  const reason = asRevealReason(formData.get("reason"));
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) redirect("/admin/sellers");
  if (!reason) redirect(`/admin/sellers/${storeId}?error=reason`);
  const row = await logDataAccess({ adminId: admin.id, subjectUserId: store.userId, action: "reveal_contact", reason, note: String(formData.get("note") ?? "") });
  redirect(`/admin/sellers/${storeId}?reveal=${row.id}#owner`);
}

/** Pause a shop (its storefront goes offline) or bring it back, with a reason and note for the log. */
export async function setSellerShopStatus(formData: FormData) {
  const admin = await requireAdminSection("partners");
  const storeId = String(formData.get("storeId") ?? "");
  const status = formData.get("status") === "active" ? "active" : "suspended";
  const reason = asShopActionReason(formData.get("reason"));
  const note = String(formData.get("note") ?? "").trim();
  if (!reason || note.length < 5) redirect(`/admin/sellers/${storeId}?error=shop#shop-status`);
  const store = await setShopStatus(storeId, status).catch(() => null);
  if (!store) redirect("/admin/sellers");
  await logDataAccess({ adminId: admin.id, subjectUserId: store.userId, action: status === "active" ? "restore_store" : "suspend_store", reason, note });
  revalidatePath("/admin/sellers");
  revalidatePath(`/admin/sellers/${storeId}`);
  redirect(`/admin/sellers/${storeId}?saved=shop#shop-status`);
}

/** Send one of the owner's notices on WhatsApp (WhatsApp Cloud), e.g. when they have no email. */
export async function sendSellerNoticeOnWhatsApp(formData: FormData) {
  const admin = await requireAdminSection("partners");
  const storeId = String(formData.get("storeId") ?? "");
  const notificationId = String(formData.get("notificationId") ?? "");
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) redirect("/admin/sellers");
  const notice = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true, title: true } });
  if (!notice || notice.userId !== store.userId) redirect(`/admin/sellers/${storeId}#notices`);
  // It goes to their phone number, so it's logged like a look at their contact details.
  await logDataAccess({ adminId: admin.id, subjectUserId: store.userId, action: "whatsapp_notice", reason: "support", note: notice.title });
  const result = await sendNotificationOnWhatsApp(notificationId);
  revalidatePath(`/admin/sellers/${storeId}`);
  redirect(`/admin/sellers/${storeId}?${result.ok ? "saved=whatsapp" : `wa=${encodeURIComponent(result.error.slice(0, 120))}`}#notices`);
}
