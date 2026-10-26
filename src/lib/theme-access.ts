// Which storefront themes a seller may switch to, by plan: basic themes come with every store (Free), premium themes
// with Starter, platinum themes with Growth and Seller Pro (the tiers in shared/plan-catalog.ts). On any plan a
// seller can also buy one theme outright (shared/theme-purchase.ts) and use it from then on. A store keeps the theme
// it already has when its plan lapses or changes; only switching to another theme is checked (the apply route, the
// editor and Rex). Only relative imports, so tests/theme-tiers.test.mjs loads it directly.

import { planTierOf, type PlanTier } from "../../shared/plan-catalog.ts";
import { ALL_THEMES_FREE, themeTierPlanName } from "../../shared/plans.ts";
import { hasPaidPlanTime } from "./store-badges.ts";
import type { SellerPlanState } from "./seller-plan.ts";
import { THEME_TIERS, themeLibraryEntry, themeTier, tierIncludes, type ThemeTier } from "./store-templates/theme-library.ts";

/** The theme tier each seller plan unlocks (supplier plans unlock nothing on a store). */
const TIER_BY_PLAN: Partial<Record<PlanTier, ThemeTier>> = {
  seller_starter: "premium",
  seller_growth: "platinum",
  seller_pro: "platinum",
};

/** The plan that unlocks each tier, as the gallery names it. */
export const TIER_PLAN_LABEL: Record<ThemeTier, string> = {
  basic: themeTierPlanName("basic"),
  premium: themeTierPlanName("premium"),
  platinum: themeTierPlanName("platinum"),
};

/** The highest theme tier the seller's plan includes: basic unless they have paid time left on Starter, Growth or Pro. */
export function sellerThemeTier(user: Pick<SellerPlanState, "planCode" | "planStatus" | "planPaidUntil"> | null | undefined, now: Date): ThemeTier {
  if (!user || !hasPaidPlanTime(user, now)) return "basic";
  const plan = planTierOf(user.planCode);
  return (plan && TIER_BY_PLAN[plan]) || "basic";
}

/**
 * The tier a seller actually gets: every theme while the launch switch (shared/plans.ts ALL_THEMES_FREE) is on, else
 * their plan's tier. Every check reads the tier through here (src/lib/theme-access.server.ts loadSellerThemeTier),
 * so the apply route, the editor, Rex, the web gallery and the phone's Shop looks all follow the one switch.
 */
export function launchThemeTier(planTier: ThemeTier, allFree: boolean = ALL_THEMES_FREE): ThemeTier {
  return allFree ? THEME_TIERS[THEME_TIERS.length - 1] : planTier;
}

export interface ThemeSwitchCheck {
  ok: boolean;
  /** The tier the theme needs. */
  tier: ThemeTier;
  /** Shown to the seller when the switch is refused. */
  message: string | null;
}

/**
 * Whether a seller on `allowed` may switch their draft from `currentThemeId` to `themeId`. Staying on the theme they
 * already have is always fine, so a store that was set up on a premium theme keeps working after a downgrade, and
 * so is a theme they bought (`owned`).
 */
export function checkThemeSwitch(themeId: string, allowed: ThemeTier, currentThemeId?: string | null, owned: readonly string[] = []): ThemeSwitchCheck {
  const tier = themeTier(themeId);
  if (themeId === currentThemeId || tierIncludes(allowed, tier) || owned.includes(themeId)) return { ok: true, tier, message: null };
  const name = themeLibraryEntry(themeId)?.name ?? themeId;
  return { ok: false, tier, message: `${name} is a ${tier} theme. Buy it once in the theme gallery, or upgrade to ${TIER_PLAN_LABEL[tier]}, to use it.` };
}

/** What the seller may use: their plan's tier and the themes they bought. */
export interface SellerThemeAccess {
  tier: ThemeTier;
  owned: string[];
}

/** Whether a theme is usable without buying it or upgrading. */
export function themeUsable(themeId: string, access: SellerThemeAccess) {
  return tierIncludes(access.tier, themeTier(themeId)) || access.owned.includes(themeId);
}

/** The tiers a seller on `allowed` can use, lowest first. */
export function unlockedTiers(allowed: ThemeTier): ThemeTier[] {
  return THEME_TIERS.filter((tier) => tierIncludes(allowed, tier));
}
