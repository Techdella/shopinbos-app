import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { blankStarterNotice, planBlankStarterMove } from "@/lib/themes/apply";

export { hydrateDraftWithStoreData, settingsWithThemeDraft, stripUndefinedDeep, type ThemeStoreData } from "@/lib/themes/apply";

/** The newest non-archived products a theme's product sections show (the seller's own and dropshipped alike). */
export const THEME_PRODUCTS_SELECT = {
  where: { status: { not: "archived" } },
  orderBy: { createdAt: "desc" },
  take: 8,
  select: { id: true, name: true, description: true, images: true, retailPrice: true, currency: true },
} satisfies Prisma.Store$storeProductsArgs;

export type BlankStarterMove =
  | { storeId: string; result: "moved"; themeId: string; themeName: string; live: boolean; notified: boolean; carriedSections: number }
  | { storeId: string; result: "skipped"; reason: "not-found" | "not-blank" | "no-theme" };

/**
 * Moves a store off the old blank starter (planBlankStarterMove) and tells a live seller, with a link to preview and
 * publish. Safe to re-run: a store already moved is no longer blank, and the notice is deduped per store.
 */
export async function moveStoreOffBlankStarter(storeId: string, options: { dryRun?: boolean; notify?: boolean } = {}): Promise<BlankStarterMove> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, userId: true, name: true, logoUrl: true, currency: true, brandSettings: true, storeProducts: THEME_PRODUCTS_SELECT },
  });
  if (!store) return { storeId, result: "skipped", reason: "not-found" };
  const plan = planBlankStarterMove(store);
  if (plan.result === "skipped") return { storeId, ...plan };

  const base = { storeId, result: "moved" as const, themeId: plan.themeId, themeName: plan.themeName, live: plan.live, carriedSections: plan.carriedSections };
  if (options.dryRun) return { ...base, notified: false };
  await db.store.update({ where: { id: store.id }, data: { brandSettings: plan.brandSettings as unknown as Prisma.InputJsonValue } });

  let notified = false;
  if (plan.live && options.notify !== false) {
    await notify({ userId: store.userId, ...blankStarterNotice(store.id, store.name, plan.themeId, plan.themeName), email: true })
      .then(() => { notified = true; })
      .catch((error) => console.error("[themes] blank starter notice failed", store.id, error));
  }
  return { ...base, notified };
}

/** Stores whose working draft is the blank starter (the saved draft, else the live version). */
export async function findBlankStarterStores() {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Store"
    WHERE COALESCE("brandSettings"->'editor'->'draft'->>'templateId', "brandSettings"->'editor'->'published'->>'templateId') = 'blank'
    ORDER BY "createdAt" ASC`;
  return rows.map((row) => row.id);
}
