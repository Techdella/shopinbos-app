"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/server-auth";
import { setRewardChoice } from "@/lib/referrals/service.server";
import { asRewardChoice } from "@shared/referrals";

const PAGE: Record<string, string> = { seller: "/home/refer", supplier: "/supplier/refer", logistics_partner: "/logistics/refer" };

/** Refer & earn: free months or AI credits when an invite counts. */
export async function chooseReferralReward(choice: string) {
  const user = await getCurrentAppUser();
  if (!user || !PAGE[user.role]) return { ok: false as const, error: "Sign in to choose your reward." };
  await setRewardChoice(user.id, asRewardChoice(choice));
  revalidatePath(PAGE[user.role]);
  return { ok: true as const };
}
