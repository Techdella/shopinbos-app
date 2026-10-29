import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import {
  fallbackDraftSnapshot,
  isBoutiqueTheme,
  parseEditorState,
  resolveDraftSnapshot,
  type StoreBrandSettingsLike,
  type StoreEditorSnapshot,
} from "@/lib/store-templates";
import { MENU_PAGE_LABELS, contentRefName, type MenuItem } from "@/lib/storefront/menu";
import {
  menuLabels,
  navigationFingerprint,
  readNavigation,
  writeNavigation,
  writeNavigationToSections,
  type StoreNavigation,
} from "@/lib/storefront/store-navigation";

// Home > Navigation reads and writes the store's menus where the storefront and the builder keep them: the header
// and footer chrome of the builder snapshot (brandSettings.editor.draft and .published).
//
// Draft vs published: the builder saves to the draft and Publish copies the draft live. A save here writes the menus
// into the draft (so the builder shows them) AND into the published snapshot and published StorePage rows, so they
// show on the live store straight away. Only the menu fields are written into the published version: other
// unpublished builder edits stay drafts. A store that was never published only gets its draft updated.

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The draft the builder would open (the saved draft, else the published version, else the template's). */
export function navigationDraft(brandSettings: unknown, storeName: string): StoreEditorSnapshot | null {
  const settings = asRecord(brandSettings) as StoreBrandSettingsLike;
  return resolveDraftSnapshot(settings, fallbackDraftSnapshot(settings, storeName));
}

export function navigationOf(snapshot: StoreEditorSnapshot | null) {
  return readNavigation(snapshot, { boutique: isBoutiqueTheme(snapshot?.templateId) });
}

function pageName(item: MenuItem, names: { categories: Map<string, string>; products: Map<string, string> }) {
  if (item.kind === "page") return MENU_PAGE_LABELS[item.ref ?? ""] ?? "";
  if (item.kind === "category") return names.categories.get(item.ref ?? "") ?? "";
  if (item.kind === "product") return names.products.get(item.ref ?? "") ?? "";
  if (item.kind === "content") return contentRefName(item.ref ?? "");
  return "";
}

export type SaveNavigationResult = "saved" | "conflict" | "missing";

export async function saveStoreNavigation(userId: string, nav: StoreNavigation, fingerprint: string): Promise<SaveNavigationResult> {
  // Re-read right before writing: the builder may have saved since this page was opened.
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, name: true, brandSettings: true, updatedAt: true } });
  if (!store) return "missing";
  const settings = asRecord(store.brandSettings);
  const draft = navigationDraft(settings, store.name);
  if (!draft) return "missing";
  if (fingerprint !== navigationFingerprint(navigationOf(draft))) return "conflict";

  const rawEditor = asRecord(settings.editor);
  const published = parseEditorState(rawEditor).published ?? null;
  const products = await db.storeProduct.findMany({ where: { storeId: store.id }, select: { id: true, name: true, category: { select: { slug: true, name: true } } } });
  const names = {
    products: new Map(products.map((product) => [product.id, product.name])),
    categories: new Map(products.filter((product) => product.category).map((product) => [product.category!.slug, product.category!.name])),
  };
  const nameOf = (item: MenuItem) => pageName(item, names);

  const nextSettings = {
    ...settings,
    editor: {
      ...rawEditor,
      draft: writeNavigation(draft, nav),
      ...(published ? { published: writeNavigation(published, nav) } : {}),
    },
    // The older lists of names (nothing renders them any more; kept in step for anything that reads them).
    navigation: {
      ...asRecord(settings.navigation),
      mainMenu: menuLabels(nav.main, nameOf),
      footerMenu: menuLabels(nav.footer, nameOf),
      mobileMenu: nav.mobileSource === "custom" ? menuLabels(nav.mobile, nameOf) : null,
    },
  };

  // Compare-and-swap on updatedAt: a builder save in between makes this a conflict instead of overwriting it.
  const written = await db.store.updateMany({
    where: { id: store.id, updatedAt: store.updatedAt },
    data: { brandSettings: nextSettings as unknown as Prisma.InputJsonValue },
  });
  if (written.count === 0) return "conflict";

  if (published) {
    // Stores rendered from their published StorePage rows (older stores) show the same menus.
    const pages = await db.storePage.findMany({ where: { storeId: store.id, isPublished: true }, select: { id: true, content: true, publishedContent: true } });
    for (const page of pages) {
      const patch = (raw: unknown) => {
        const content = asRecord(raw);
        if (!Array.isArray(content.sections)) return undefined;
        const sections = writeNavigationToSections(content.sections as never[], nav);
        return sections === content.sections ? undefined : ({ ...content, sections } as unknown as Prisma.InputJsonValue);
      };
      const content = patch(page.content);
      const publishedContent = patch(page.publishedContent);
      if (!content && !publishedContent) continue;
      await db.storePage.update({ where: { id: page.id }, data: { ...(content ? { content } : {}), ...(publishedContent ? { publishedContent } : {}) } });
    }
  }
  return "saved";
}
