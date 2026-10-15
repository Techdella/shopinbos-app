import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { clearStaleLogoText } from "@/lib/store-templates/chrome";
import { RESERVED_SUBDOMAINS } from "@/lib/storefront/host-routing";
import { renameInContent, renameInText } from "@shared/store-rename";
import { nextPreviousSlugs, normalizeStoreSlug, slugCooldownDaysLeft, storeSlugShapeProblem } from "@shared/store-address";

// A store's web address (slug). Renaming the store never touches it; changing it is a separate, confirmed step,
// limited to once every 30 days while the store is live, and the old address keeps redirecting to the new one
// (src/app/s/[slug]/layout.tsx) so links already shared, printed or indexed still reach the store.

/** True when another store uses this address now or used it before (old addresses stay with their store). */
export async function isStoreSlugTaken(slug: string, exceptStoreId?: string) {
  const row = await db.store.findFirst({
    where: { OR: [{ slug }, { previousSlugs: { has: slug } }], ...(exceptStoreId ? { NOT: { id: exceptStoreId } } : {}) },
    select: { id: true },
  });
  return Boolean(row);
}

export type SlugChangeResult = { ok: true; slug: string; changed: boolean } | { ok: false; message: string };

/**
 * Moves a store to a new address, keeping the old one as a redirect. Returns the reason instead when the
 * address is malformed, taken, or the store changed address less than 30 days ago while live.
 */
export async function changeStoreSlug(storeId: string, requested: string, now = new Date()): Promise<SlugChangeResult> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, slug: true, status: true, previousSlugs: true, slugChangedAt: true } });
  if (!store) return { ok: false, message: "Store not found." };
  const slug = normalizeStoreSlug(requested);
  if (!slug || slug === store.slug) return { ok: true, slug: store.slug, changed: false };

  const shape = storeSlugShapeProblem(slug, RESERVED_SUBDOMAINS);
  if (shape) return { ok: false, message: shape };
  // Taking back one of the store's own old addresses is allowed; anyone else's is not.
  if (await isStoreSlugTaken(slug, store.id)) return { ok: false, message: "That web address is already taken. Try another." };
  const daysLeft = store.status === "active" ? slugCooldownDaysLeft(store.slugChangedAt, now) : 0;
  if (daysLeft > 0) {
    return { ok: false, message: `Your web address changed recently. You can change it again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.` };
  }

  await db.store.update({
    where: { id: store.id },
    data: { slug, previousSlugs: nextPreviousSlugs(store.previousSlugs, store.slug, slug), slugChangedAt: now },
  });
  return { ok: true, slug, changed: true };
}

/** The current address of the store that used to live at `slug`, or null. */
export async function currentSlugForOldSlug(slug: string) {
  if (!slug) return null;
  const row = await db.store.findFirst({ where: { previousSlugs: { has: slug } }, select: { slug: true } });
  return row && row.slug !== slug ? row.slug : null;
}

/**
 * After a rename, the store's editor snapshots follow the new name: header "Shop name" fields that still say the
 * old name are emptied (empty = follows the store name), and the old name is replaced by the new one in page text
 * (SEO titles and descriptions, footer line, hero eyebrows, about copy; rules in shared/store-rename.ts).
 * Returns the new brand settings, or null when nothing changed.
 */
export function clearStaleShopNames(brandSettings: unknown, oldName: string, newName = "") {
  if (!oldName.trim() || !brandSettings || typeof brandSettings !== "object" || Array.isArray(brandSettings)) return null;
  const settings = brandSettings as Record<string, unknown>;
  if (!settings.editor || typeof settings.editor !== "object") return null;
  const editor = renameStoreInContent(settings.editor, oldName, newName);
  return editor ? { ...settings, editor } : null;
}

/** clearStaleLogoText then renameInContent on any snapshot or page content; null when nothing changed. */
export function renameStoreInContent<T>(content: T, oldName: string, newName: string): T | null {
  const cleared = clearStaleLogoText(content, oldName);
  const renamed = newName.trim() ? renameInContent(cleared ?? content, oldName, newName) : null;
  return renamed ?? cleared;
}

/**
 * The same clean-up for the store's StorePage rows (their content, draft and published copies hold the page's
 * sections, header and SEO included, and the row's title), so pages read from those rows follow the new name too.
 * Call after a rename.
 */
export async function clearStaleShopNamesInStorePages(storeId: string, oldName: string, newName = "") {
  if (!oldName.trim()) return 0;
  const pages = await db.storePage.findMany({ where: { storeId }, select: { id: true, title: true, content: true, draftContent: true, publishedContent: true } });
  let updated = 0;
  for (const page of pages) {
    const data: Record<string, Prisma.InputJsonValue> = {};
    for (const key of ["content", "draftContent", "publishedContent"] as const) {
      const cleared = page[key] ? renameStoreInContent(page[key], oldName, newName) : null;
      if (cleared) data[key] = cleared as Prisma.InputJsonValue;
    }
    const title = newName.trim() ? renameInText(page.title, oldName, newName) : page.title;
    if (title !== page.title) data.title = title;
    if (!Object.keys(data).length) continue;
    await db.storePage.update({ where: { id: page.id }, data });
    updated += 1;
  }
  return updated;
}
