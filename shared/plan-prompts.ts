// The slide-in shown when something isn't on the person's plan ("Upgrade to unlock this feature") or their AI
// credits ran out. The web shows it with a button to the plans or the top-up popup
// (src/components/plans/PlanPrompts.tsx); the phone apps and pages opened from them say "This isn't on your plan"
// with no price, link or button (Apple 3.1.1 / 3.1.3(f), shared/store-payments.ts), and their credits note says
// only when they refill (apps/mobile/src/components/PlanPrompt.tsx).

/** API error codes that mean "not on your plan". */
export const PLAN_LOCK_CODES = ["PLAN_LIMIT", "UPGRADE_REQUIRED"] as const;
/** The API error code for "no AI credits left". */
export const CREDITS_CODE = "AI_CREDITS_NEEDED";

export type PlanPromptKind = "plan" | "credits";

/** Which slide-in an API error code calls for, or null for any other error. */
export function planPromptFor(code: string | null | undefined): PlanPromptKind | null {
  if (!code) return null;
  if ((PLAN_LOCK_CODES as readonly string[]).includes(code)) return "plan";
  if (code === CREDITS_CODE) return "credits";
  return null;
}

/** Where each kind of account picks a plan on the web. */
export function plansUrlFor(role: string | null | undefined) {
  if (role === "supplier") return `/supplier/profile?tab=${encodeURIComponent("Billing & Plan")}`;
  if (role === "logistics_partner") return "/logistics/billing";
  return "/home/settings?tab=Billing";
}

/** The event a page fires to show the slide-in itself (a locked button that was tapped). */
export const PLAN_PROMPT_EVENT = "shopinbos:plan-prompt";

export interface PlanPromptDetail {
  kind: PlanPromptKind;
  /** The server's sentence ("Pay on delivery comes with the Growth plan and up."), when there is one. */
  message?: string | null;
}
