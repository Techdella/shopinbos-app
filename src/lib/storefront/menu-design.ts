// Rex designing the store's menus in the builder, pure parts: turning the model's answer into menus the store can
// show (only pages, categories, products and content the store has, and only its own pictures), the preview
// snapshot with that design written in, and the section changes to save once the seller applies it.
// Unit-tested in tests/rex-menu-design.test.mjs (relative imports carry .ts).

import { MENU_STYLES, MOBILE_MENU_STYLES, isContentRef, menuStyleOf, mobileMenuStyleOf, readMenu, safeMenuUrl, type MenuItem, type MenuStyle, type MobileMenuStyle } from "./menu.ts";
import { flattenMenu, writeNavigation, type StoreNavigation } from "./store-navigation.ts";
import type { StoreEditorPatchOp, StoreEditorSnapshot } from "../store-templates/types";

export interface MenuDesign {
  main: MenuItem[];
  /** Null: the footer stays as it is. */
  footer: MenuItem[] | null;
  menuStyle: MenuStyle;
  mobileStyle: MobileMenuStyle;
}

/** What the store has, for Rex's prompt and for checking its answer. */
export interface MenuCatalog {
  pages: string[];
  categories: Array<{ slug: string; name: string; image: string | null }>;
  products: Array<{ id: string; name: string; image: string | null }>;
  /** Content collections and posts, by path ("blog", "blog/a-post"). */
  content: Array<{ ref: string; name: string }>;
}

/** Picture keys Rex may use: "c:<category slug>" and "p:<product id>". */
export function catalogImages(catalog: MenuCatalog): Map<string, string> {
  const images = new Map<string, string>();
  for (const category of catalog.categories) if (category.image) images.set(`c:${category.slug}`, category.image);
  for (const product of catalog.products) if (product.image) images.set(`p:${product.id}`, product.image);
  return images;
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function cleanItems(raw: unknown, catalog: MenuCatalog, images: Map<string, string>, depth: number): Array<Omit<MenuItem, "id">> {
  if (!Array.isArray(raw)) return [];
  const pages = new Set(["home", ...catalog.pages]);
  const categories = new Set(catalog.categories.map((entry) => entry.slug));
  const products = new Set(catalog.products.map((entry) => entry.id));
  const content = new Set(catalog.content.map((entry) => entry.ref));
  const known = new Set(images.values());
  const out: Array<Omit<MenuItem, "id">> = [];
  for (const entry of raw.slice(0, 24)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const label = str(row.label, 60);
    const kind = str(row.kind, 12);
    const ref = str(row.ref, 170);
    let item: Omit<MenuItem, "id"> | null = null;
    if (kind === "page" && pages.has(ref)) item = { kind, ref, label };
    else if (kind === "category" && categories.has(ref)) item = { kind, ref, label };
    else if (kind === "product" && products.has(ref)) item = { kind, ref, label };
    else if (kind === "content" && isContentRef(ref) && content.has(ref)) item = { kind, ref, label };
    else if (kind === "link" && label) {
      const url = safeMenuUrl(row.url);
      if (url) item = { kind, url, label };
    }
    if (!item) continue;
    // Only the store's own pictures: a key from the catalog, or one of those addresses.
    const image = str(row.image, 2000);
    const picture = images.get(image) ?? (known.has(image) ? image : "");
    if (picture) item.image = picture;
    if (depth === 0) {
      const children = cleanItems(row.children, catalog, images, 1);
      if (children.length) item.children = children.map((child) => ({ ...child, id: "" })) as MenuItem[];
    }
    out.push(item);
  }
  return out;
}

/** The model's design, kept to what the store has. Null when nothing usable came back. */
export function cleanMenuDesign(raw: unknown, catalog: MenuCatalog, current: { menuStyle: MenuStyle; mobileStyle: MobileMenuStyle }): MenuDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const answer = raw as Record<string, unknown>;
  const images = catalogImages(catalog);
  // readMenu gives every item an id and keeps the menu within its limits.
  const main = readMenu({ menu: cleanItems(answer.main, catalog, images, 0) });
  if (!main.length) return null;
  const footerItems = Array.isArray(answer.footer) ? cleanItems(answer.footer, catalog, images, 1) : null;
  return {
    main,
    footer: footerItems && footerItems.length ? flattenMenu(readMenu({ menu: footerItems })) : null,
    menuStyle: MENU_STYLES.some((style) => style.value === answer.menuStyle) ? menuStyleOf(answer.menuStyle) : current.menuStyle,
    mobileStyle: MOBILE_MENU_STYLES.some((style) => style.value === answer.mobileStyle) ? mobileMenuStyleOf(answer.mobileStyle) : current.mobileStyle,
  };
}

/** The snapshot with the design written into every header and footer (they are one shared chrome). */
export function withMenuDesign(snapshot: StoreEditorSnapshot, design: MenuDesign, nav: StoreNavigation): StoreEditorSnapshot {
  const written = writeNavigation(snapshot, { ...nav, main: design.main, mobileStyle: design.mobileStyle, footer: design.footer ?? nav.footer });
  return {
    ...written,
    pages: written.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => (section.kind === "header" ? { ...section, settings: { ...(section.settings ?? {}), menuStyle: design.menuStyle } } : section)),
    })),
  };
}

/** The current header menu style, as the storefront reads it. */
export function headerMenuStyle(snapshot: StoreEditorSnapshot | null | undefined, fallback: MenuStyle = "classic"): MenuStyle {
  const header = snapshot?.pages?.flatMap((page) => page.sections ?? []).find((section) => section?.kind === "header");
  return header?.settings?.menuStyle ? menuStyleOf(header.settings.menuStyle) : fallback;
}

/** Edits that turn `before` into `after`: one update for each section that changed (same ids on the same pages). */
export function changedSectionOps(before: StoreEditorSnapshot, after: StoreEditorSnapshot): StoreEditorPatchOp[] {
  const ops: StoreEditorPatchOp[] = [];
  for (const page of after.pages) {
    const old = before.pages.find((entry) => entry.pageType === page.pageType);
    if (!old) continue;
    for (const section of page.sections) {
      const was = old.sections.find((entry) => entry.id === section.id);
      if (was && JSON.stringify(was) !== JSON.stringify(section)) ops.push({ op: "update-section", pageType: page.pageType, sectionId: section.id, changes: section });
    }
  }
  return ops;
}
