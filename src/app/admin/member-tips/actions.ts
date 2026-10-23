"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { saveTipSettings, sendTipTest, tipSettings } from "@/lib/member-messaging/tips.server";
import { submitMemberTemplates } from "@/lib/member-messaging/templates.server";
import { setJourneysOn } from "@/lib/member-messaging/journeys.server";
import { setLoyaltyOn } from "@/lib/member-messaging/loyalty.server";
import { isLocale } from "@shared/i18n";

const PATH = "/admin/member-tips";

function back(params: Record<string, string>): never {
  redirect(`${PATH}?${new URLSearchParams(params).toString()}`);
}

/** Switch the weekly email or WhatsApp tips on or off. */
export async function setTipChannel(formData: FormData) {
  const admin = await requireAdminSection("leads");
  const channel = formData.get("channel") === "whatsapp" ? "whatsapp" : "email";
  const on = formData.get("on") === "1";
  const current = await tipSettings();
  await saveTipSettings({ ...current, [channel]: on }, admin.id);
  revalidatePath(PATH);
  back({ saved: `${channel === "email" ? "Weekly tip emails" : "Weekly WhatsApp tips"} ${on ? "switched on" : "switched off"}.` });
}

/** Email one tip to yourself to check it. */
export async function sendTestTip(formData: FormData) {
  const admin = await requireAdminSection("leads");
  const locale = formData.get("locale");
  const result = await sendTipTest(String(formData.get("tip") ?? ""), { id: admin.id, email: admin.email, name: admin.name }, isLocale(locale) ? locale : "en");
  back(result.ok ? { saved: `Test sent to ${admin.email}.` } : { error: result.error });
}

/** Send the members' WhatsApp templates (tips and referrals) that Meta doesn't have yet. */
export async function submitTipTemplates() {
  await requireAdminSection("leads");
  const result = await submitMemberTemplates();
  revalidatePath(PATH);
  back(result.failures.length ? { error: result.failures.join(" · ").slice(0, 500) } : { saved: `${result.submitted} template${result.submitted === 1 ? "" : "s"} sent to Meta for approval.` });
}

/** Switch the retention journeys (setup help, win-back, first wins, low credits) on or off. */
export async function setJourneys(formData: FormData) {
  const admin = await requireAdminSection("leads");
  const on = formData.get("on") === "1";
  await setJourneysOn(on, admin.id);
  revalidatePath(PATH);
  back({ saved: `Journeys ${on ? "switched on" : "switched off"}.` });
}

/** Switch the loyalty perks (monthly tier credits, tier-up messages, anniversary gifts) on or off. */
export async function setLoyalty(formData: FormData) {
  const admin = await requireAdminSection("leads");
  const on = formData.get("on") === "1";
  await setLoyaltyOn(on, admin.id);
  revalidatePath(PATH);
  back({ saved: `Loyalty perks ${on ? "switched on" : "switched off"}.` });
}
