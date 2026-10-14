import type { z } from "zod";
import type { FormReward } from "@/lib/marketing/forms";
import type { FormSchema } from "../schemas";

/** What goes in StoreForm.popupConfig: the pop-up settings for pop-ups; only the reward for sign-up pages. */
export function storedPopupConfig(input: z.infer<typeof FormSchema>, reward: FormReward | null) {
  const { reward: _ignored, ...rest } = input.popupConfig;
  void _ignored;
  return input.isPopup ? { ...rest, redirectUrl: rest.redirectUrl || undefined, reward } : { reward };
}
