// Start here steps come from the server (src/lib/setup on the web) and keep their standard names (Domain, Theme,
// Payout bank, Campaign). On mobile a few steps go somewhere else (the team sets up a domain via "Ask us", a theme
// opens on a bigger screen), so only their button label and hint change here. Pure, so the root tests can check it.

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

export function stepWords(step: StepLike) {
  const mobile = MOBILE_STEP[step.key];
  return { title: step.title, hint: step.done ? step.hint : mobile?.hint ?? step.hint, label: mobile?.label ?? step.action.label };
}
