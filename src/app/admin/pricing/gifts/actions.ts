"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { GiftError, endPlanGift, giftCredits, giftPlan } from "@/lib/admin/gifts.server";

// Admin › Pricing › Gifts and free plans. The rules and the log are in src/lib/admin/gifts.server.ts.

const PAGE = "/admin/pricing/gifts";

function back(userId: string, params: Record<string, string>) {
  const query = new URLSearchParams({ user: userId, ...params });
  return `${PAGE}?${query.toString()}#gift`;
}

async function run(userId: string, work: () => Promise<string>) {
  let to: string;
  try {
    to = back(userId, { saved: await work() });
  } catch (error) {
    if (!(error instanceof GiftError)) throw error;
    to = back(userId, { error: error.message });
  }
  revalidatePath(PAGE);
  redirect(to);
}

/** Free AI credits for one person. */
export async function giveCreditsAction(formData: FormData) {
  const admin = await requireAdminSection("money");
  const userId = String(formData.get("userId") ?? "");
  await run(userId, async () => {
    const { credits } = await giftCredits({ adminId: admin.id, userId, credits: Number(String(formData.get("credits") ?? "").replace(/[,\s]/g, "")), note: String(formData.get("note") ?? "") });
    return `${credits.toLocaleString("en-NG")} AI credits given.`;
  });
}

/** Free time on a paid plan for one person. */
export async function givePlanAction(formData: FormData) {
  const admin = await requireAdminSection("money");
  const userId = String(formData.get("userId") ?? "");
  await run(userId, async () => {
    const { plan, endsAt } = await giftPlan({ adminId: admin.id, userId, tier: String(formData.get("tier") ?? ""), months: Number(formData.get("months")), note: String(formData.get("note") ?? "") });
    return `${plan} given until ${endsAt.toISOString().slice(0, 10)}.`;
  });
}

/** Ends free plan time a team member gave. */
export async function endGiftAction(formData: FormData) {
  const admin = await requireAdminSection("money");
  const userId = String(formData.get("userId") ?? "");
  await run(userId, async () => {
    await endPlanGift({ adminId: admin.id, grantId: String(formData.get("grantId") ?? ""), note: String(formData.get("note") ?? "") });
    return "Gift ended.";
  });
}
