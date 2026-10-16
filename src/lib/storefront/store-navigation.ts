// The store's menus as one record: the header's main menu (copy `menu`, with `navLinks` kept in step), the phone
// menu (header setting `mobileMenuSource` "main" | "custom", custom items in copy `mobileMenuItems`, drawer style in
// setting `mobileMenu`) and the footer links (footer copy `menu`, a flat list). They live in the builder snapshot's
// global chrome (src/lib/store-templates/chrome.ts), the same data the storefront renders and the builder edits, so
// /home/navigation and the builder are one source of truth.
// Pure data helpers, unit-tested in tests/store-navigation.test.mjs (no bundler: relative imports carry .ts).

import { menuPageKeys, mobileMenuStyleOf, readMenu, type MenuItem, type MobileMenuStyle } from "./menu.ts";
import { sharedChrome } from "../store-templates/chrome.ts";
import type { StoreEditorSnapshot, TemplateSectionNode } from "../store-templates/types";

export type MobileMenuSource = "main" | "custom";

export interface StoreNavigation {
  main: MenuItem[];
  mobileSource: MobileMenuSource;
  /** The phone menu's own items (used when mobileSource is "custom"). */
  mobile: MenuItem[];
  mobileStyle: MobileMenuStyle;
  footer: MenuItem[];
}

/** The footer links boutique themes show until the seller picks their own. */
export const BOUTIQUE_FOOTER_DEFAULT: MenuItem[] = [
  { id: "footer-products", kind: "page", ref: "products", label: "" },
  { id: "footer-faq", kind: "page", ref: "faq", label: "Delivery and FAQ" },
  { id: "footer-about", kind: "page", ref: "about", label: "" },
  { id: "footer-contact", kind: "page", ref: "contact", label: "" },
];

function copyOf(section: TemplateSectionNode | null | undefined): Record<string, unknown> {
  return (section?.blocks?.find((block) => block.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

/** No dropdowns in the footer: sub-items move up beside their parent. */
export function flattenMenu(menu: MenuItem[]): MenuItem[] {
  const flat: MenuItem[] = [];
  for (const item of menu) {
    const { children, ...rest } = item;
    flat.push(rest);
    for (const child of children ?? []) flat.push({ ...child });
  }
  return flat;
}

export function mobileMenuSourceOf(value: unknown): MobileMenuSource {
  return value === "custom" ? "custom" : "main";
}

/** The phone menu's own items when the seller chose them, else null (the phone shows the main menu). */
export function readMobileMenu(copy: Record<string, unknown> | null | undefined, settings: Record<string, unknown> | null | undefined): MenuItem[] | null {
  if (mobileMenuSourceOf(settings?.mobileMenuSource) !== "custom") return null;
  return readMenu({ menu: Array.isArray(copy?.mobileMenuItems) ? copy.mobileMenuItems : [] });
}

/** The footer links the seller picked, else null (the theme's usual links). */
export function readFooterMenu(copy: Record<string, unknown> | null | undefined): MenuItem[] | null {
  if (!Array.isArray(copy?.menu)) return null;
  return flattenMenu(readMenu({ menu: copy.menu }));
}

export function chromeSections(snapshot: StoreEditorSnapshot | null | undefined) {
  const chrome = snapshot && Array.isArray(snapshot.pages) ? sharedChrome(snapshot) : [];
  return {
    header: chrome.find((section) => section.kind === "header") ?? null,
    footer: chrome.find((section) => section.kind === "footer") ?? null,
  };
}

/**
 * The menus the store shows now. `boutique`: the footer default is the boutique themes' fixed links; the other
 * themes' footer lists the main menu's pages.
 */
export function readNavigation(snapshot: StoreEditorSnapshot | null | undefined, options: { boutique?: boolean } = {}): StoreNavigation & { hasHeader: boolean; hasFooter: boolean } {
  const { header, footer } = chromeSections(snapshot);
  const headerCopy = copyOf(header);
  const main = readMenu(headerCopy, options.boutique ? undefined : ["home", "products", "about", "blog", "faq", "contact"]);
  const custom = readMobileMenu(headerCopy, header?.settings);
  const savedFooter = readFooterMenu(copyOf(footer));
  const footerDefault = options.boutique
    ? BOUTIQUE_FOOTER_DEFAULT.map((item) => ({ ...item }))
    : menuPageKeys(main).map((page) => ({ id: `footer-${page}`, kind: "page" as const, ref: page, label: "" }));
  return {
    main,
    mobileSource: custom ? "custom" : "main",
    mobile: custom ?? (Array.isArray(headerCopy.mobileMenuItems) ? readMenu({ menu: headerCopy.mobileMenuItems }) : []),
    mobileStyle: mobileMenuStyleOf(header?.settings?.mobileMenu),
    footer: savedFooter ?? footerDefault,
    hasHeader: Boolean(header),
    hasFooter: Boolean(footer),
  };
}

/** A comparable fingerprint of the menus, to notice the builder saving them while this page was open. */
export function navigationFingerprint(nav: StoreNavigation): string {
  // Fixed key order, so the same menus always give the same text however their objects were built.
  const canon = (menu: MenuItem[]): unknown[] => menu.map((item) => [item.id, item.kind, item.ref ?? null, item.url ?? null, item.label, Boolean(item.newTab), canon(item.children ?? [])]);
  return JSON.stringify([canon(nav.main), nav.mobileSource, canon(nav.mobile), nav.mobileStyle, canon(nav.footer)]);
}

/** Cleans what a form sent (unknown JSON): only valid items, safe links, footer flat. */
export function parseNavigationInput(raw: unknown): StoreNavigation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? readMenu({ menu: value }) : []);
  return {
    main: list(input.main),
    mobileSource: mobileMenuSourceOf(input.mobileSource),
    mobile: list(input.mobile),
    mobileStyle: mobileMenuStyleOf(input.mobileStyle),
    footer: flattenMenu(list(input.footer)),
  };
}

function setCopy(section: TemplateSectionNode, values: Record<string, unknown>): TemplateSectionNode {
  const blocks = Array.isArray(section.blocks) ? section.blocks : [];
  const at = blocks.findIndex((block) => block.type === "copy");
  if (at === -1) return { ...section, blocks: [{ id: `${section.id}-copy`, type: "copy", content: { ...values } }, ...blocks] };
  return { ...section, blocks: blocks.map((block, index) => (index === at ? { ...block, content: { ...block.content, ...values } } : block)) };
}

/** The header and footer sections of a list with the menus written in. Everything else stays as it was. */
export function writeNavigationToSections<T extends TemplateSectionNode>(sections: T[], nav: StoreNavigation): T[] {
  let changed = false;
  const next = sections.map((section) => {
    if (!section || typeof section !== "object") return section;
    if (section.kind === "header") {
      changed = true;
      const withCopy = setCopy(section, { menu: nav.main, navLinks: menuPageKeys(nav.main), mobileMenuItems: nav.mobile });
      return { ...withCopy, settings: { ...(section.settings ?? {}), mobileMenu: nav.mobileStyle, mobileMenuSource: nav.mobileSource } } as unknown as T;
    }
    if (section.kind === "footer") {
      changed = true;
      return setCopy(section, { menu: flattenMenu(nav.footer) }) as T;
    }
    return section;
  });
  return changed ? next : sections;
}

/** The snapshot with the menus written into every page's header and footer (they are one shared chrome). */
export function writeNavigation<T extends StoreEditorSnapshot>(snapshot: T, nav: StoreNavigation, now = new Date()): T {
  if (!snapshot || !Array.isArray(snapshot.pages)) return snapshot;
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => (Array.isArray(page.sections) ? { ...page, sections: writeNavigationToSections(page.sections, nav) } : page)),
    updatedAt: now.toISOString(),
  };
}

/** The names shoppers read, for the older brandSettings.navigation lists. */
export function menuLabels(menu: MenuItem[], nameOf: (item: MenuItem) => string): string[] {
  return menu.map((item) => (item.label.trim() || nameOf(item)).trim()).filter(Boolean);
}
