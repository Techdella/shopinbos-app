"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { adminDecideReferral } from "@/lib/referrals/service.server";
import { submitMemberTemplates } from "@/lib/member-messaging/templates.server";
import { startReferralAnnouncement, stopReferralAnnouncement } from "@/lib/member-messaging/announce.server";

const back = (formData: FormData) => {
  const to = String(formData.get("back") ?? "/admin/referrals");
  return to.startsWith("/admin/referrals") ? to : "/admin/referrals";
};

/** Count an invite now (checked by hand), or turn it down. */
export async function decideReferral(formData: FormData) {
  await requireAdminSection("leads");
  const id = String(formData.get("id") ?? "");
  const decision = formData.get("decision") === "reward" ? "reward" : "reject";
  if (id) await adminDecideReferral(id, decision, String(formData.get("reason") ?? ""));
  revalidatePath("/admin/referrals");
  redirect(back(formData));
}

/** Send the members' WhatsApp templates (referrals) that Meta doesn't have yet. */
export async function submitReferralTemplates(formData: FormData) {
  await requireAdminSection("leads");
  const result = await submitMemberTemplates();
  revalidatePath("/admin/referrals");
  const url = new URL(back(formData), "https://x");
  url.searchParams.set(result.failures.length ? "error" : "submitted", result.failures.length ? result.failures.join(" · ").slice(0, 500) : String(result.submitted));
  redirect(`${url.pathname}${url.search}`);
}

/** Tell every seller, supplier and delivery partner about Refer & earn (sent in batches, each person once), or pause it. */
export async function toggleReferralAnnouncement(formData: FormData) {
  const admin = await requireAdminSection("leads");
  if (formData.get("start") === "1") await startReferralAnnouncement(admin.id);
  else await stopReferralAnnouncement();
  revalidatePath("/admin/referrals");
  redirect(back(formData));
}
