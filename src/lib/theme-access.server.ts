import "server-only";
import { db } from "@/lib/db/client";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { sellerThemeTier } from "@/lib/theme-access";
import type { ThemeTier } from "@/lib/store-templates/theme-library";

/** The highest theme tier the seller's plan includes right now (plans created from admin count too). */
export async function loadSellerThemeTier(userId: string): Promise<ThemeTier> {
  await getPlanCatalog();
  const user = await db.user.findUnique({ where: { id: userId }, select: { planCode: true, planStatus: true, planPaidUntil: true } }).catch(() => null);
  return sellerThemeTier(user, new Date());
}
