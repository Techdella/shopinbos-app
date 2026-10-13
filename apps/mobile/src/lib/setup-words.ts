// Start here steps come from the server (src/lib/setup on the web) and keep their standard names (Domain, Theme,
// Payout bank, Campaign). On mobile a few steps go somewhere else (the team sets up a domain via "Ask us", a theme
// opens on a bigger screen), so only their button label and hint change here. Pure, so the root tests can check it.
// Pass the screen's `t` (with "m_onboarding") for the mobile words in the app language ("step.<key>.label|hint").
import type { TFunction } from "@shared/i18n";

interface StepLike {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  action: { label: string };
}

/** Mobile button labels and hints for the server's steps whose mobile route differs from the web's. */
const MOBILE_STEP: Record<string, { hint?: string; label: string }> = {
  look: { label: "Pick a theme" },
  domain: { hint: "Optional. A .com or .ng domain that's yours. We set it up for you.", label: "Ask us" },
};

export function stepWords(step: StepLike, t?: Pick<TFunction, "dynamic">) {
  const mobile = MOBILE_STEP[step.key];
  const say = (field: "hint" | "label", english: string | undefined) => (english !== undefined && t ? t.dynamic(`step.${step.key}.${field}`, english) : english);
  return { title: step.title, hint: step.done ? step.hint : say("hint", mobile?.hint) ?? step.hint, label: say("label", mobile?.label) ?? step.action.label };
}
