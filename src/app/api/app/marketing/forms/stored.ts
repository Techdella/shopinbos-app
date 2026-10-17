import type { z } from "zod";
import type { FormReward } from "@/lib/marketing/forms";
import { collectsSignup } from "@/lib/marketing/popup-kinds";
import type { FormSchema } from "../schemas";

/** The reward the editor sent, if this kind of pop-up hands one out (games, sales and notices never do). */
export function rewardInput(input: z.infer<typeof FormSchema>) {
  return !input.isPopup || collectsSignup(input.popupConfig.kind) ? (input.popupConfig.reward ?? null) : null;
}

/** What goes in StoreForm.popupConfig: the pop-up settings for pop-ups; only the reward for sign-up pages. */
export function storedPopupConfig(input: z.infer<typeof FormSchema>, reward: FormReward | null) {
  const { reward: _ignored, ...rest } = input.popupConfig;
  void _ignored;
  return input.isPopup ? { ...rest, redirectUrl: rest.redirectUrl || undefined, reward } : { reward };
}
