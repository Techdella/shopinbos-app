import "server-only";

import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { addMenuItems, type MenuItem } from "@/lib/storefront/menu";
import { flattenMenu, navigationFingerprint } from "@/lib/storefront/store-navigation";
import { navigationDraft, navigationOf, saveStoreNavigation } from "@/lib/store-navigation.server";

// Putting a CMS collection (the Blog, a Recipe book…) in the store's header or footer menu, through the same
// saver as Home › Navigation. The item is a "content" link (the collection's path), which each storefront theme
// turns into the right address; older full-address links to the collection still count as "in the menu".

export type MenuPlacement = "header" | "footer" | "both";

type Store = { slug: string; customDomain: string | null };
type Collection = { name: string; slug: string };

export function collectionMenuUrl(store: Store, collection: Collection) {
  return buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }, `/${collection.slug}`);
}

/** Whether a menu already links to the collection (its own address, a store path, or the Blog page). */
export function menuHasCollection(menu: MenuItem[], store: Store, collection: Collection) {
  const url = collectionMenuUrl(store, collection);
  const matches = new Set([url, `${url}/`, `/${collection.slug}`, `/${collection.slug}/`]);
  return flattenMenu(menu).some((item) =>
    item.kind === "content" ? item.ref === collection.slug : item.kind === "page" ? collection.slug === "blog" && item.ref === "blog" : item.kind === "link" && matches.has(item.url ?? ""),
  );
}

async function readStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, name: true, slug: true, customDomain: true, brandSettings: true } });
}

/** Where the collection shows in the store's menus now. */
export async function collectionMenuState(userId: string, collection: Collection) {
  const store = await readStore(userId);
  if (!store) return { header: false, footer: false };
  const nav = navigationOf(navigationDraft(store.brandSettings, store.name));
  return { header: menuHasCollection(nav.main, store, collection), footer: menuHasCollection(nav.footer, store, collection) };
}

/** Adds the collection to the header and / or footer menu (skipping a menu that has it already). */
export async function addCollectionToMenu(userId: string, collection: Collection, placement: MenuPlacement) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const store = await readStore(userId);
    if (!store) return "missing" as const;
    const nav = navigationOf(navigationDraft(store.brandSettings, store.name));
    const item = { kind: "content" as const, ref: collection.slug, label: collection.name };
    const next = { ...nav };
    if (placement !== "footer" && !menuHasCollection(nav.main, store, collection)) next.main = addMenuItems(nav.main, [item]);
    if (placement !== "header" && !menuHasCollection(nav.footer, store, collection)) next.footer = addMenuItems(nav.footer, [item]);
    if (next.main === nav.main && next.footer === nav.footer) return "saved" as const;
    const result = await saveStoreNavigation(userId, next, navigationFingerprint(nav));
    // Someone (the builder) saved in between: read again and retry once.
    if (result !== "conflict") return result;
  }
  return "conflict" as const;
}
