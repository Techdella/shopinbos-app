import "server-only";
import { db } from "@/lib/db/client";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { ALL_THEMES_FREE } from "@shared/plans";
import { launchThemeTier, sellerThemeTier, type SellerThemeAccess } from "@/lib/theme-access";
import { ownedThemeIds } from "@/lib/themes/purchase.server";
import type { ThemeTier } from "@/lib/store-templates/theme-library";

/**
 * The highest theme tier the seller may use right now: every tier while the launch switch is on (shared/plans.ts
 * ALL_THEMES_FREE), else what their plan includes (plans created from admin count too).
 */
export async function loadSellerThemeTier(userId: string): Promise<ThemeTier> {
  // The launch switch: every theme for everyone, without reading the plan.
  if (ALL_THEMES_FREE) return launchThemeTier("basic");
  await getPlanCatalog();
  const user = await db.user.findUnique({ where: { id: userId }, select: { planCode: true, planStatus: true, planPaidUntil: true } }).catch(() => null);
  return sellerThemeTier(user, new Date());
}

/** The seller's plan tier plus the themes they bought, for every theme switch check. */
export async function loadSellerThemeAccess(userId: string): Promise<SellerThemeAccess> {
  const [tier, owned] = await Promise.all([loadSellerThemeTier(userId), ownedThemeIds(userId)]);
  return { tier, owned };
}
