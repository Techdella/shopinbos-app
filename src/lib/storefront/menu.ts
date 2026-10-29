// The store's main menu (header section copy `menu`), built like a classic WordPress menu: the seller adds pages,
// categories, products or their own links, renames them, orders them and tucks some under others as a dropdown.
// Older stores only have `navLinks` (a list of page names); readMenu turns those into menu items, so nothing changes
// for them until they edit the menu.

export type MenuItemKind = "page" | "category" | "product" | "content" | "link";

export interface MenuItem {
  id: string;
  kind: MenuItemKind;
  /** The page type (page), category slug (category), product id (product), or a content path (content):
   * a collection ("blog") or one of its items ("blog/how-to-choose-a-lamp"). */
  ref?: string;
  /** Web address, for "link" items. */
  url?: string;
  /** What shoppers read. Empty: the page, category or product's own name. */
  label: string;
  /** Opens in a new tab (own links only). */
  newTab?: boolean;
  /** Sub-items: the dropdown under this item. One level deep. */
  children?: MenuItem[];
  /** A picture for the item (https), shown in the mega menu and the phone sheet. Else the category's or product's. */
  image?: string;
}

/** How the menu looks on computers. */
export const MENU_STYLES = [
  { value: "classic", label: "Classic", hint: "Plain words, dropdowns under them" },
  { value: "underline", label: "Underline", hint: "A line slides under the page you're on" },
  { value: "pills", label: "Pills", hint: "Rounded buttons, the current page filled" },
  { value: "caps", label: "Small caps", hint: "Small, spaced-out capitals" },
  { value: "mega", label: "Mega menu", hint: "Dropdowns open as a wide panel" },
] as const;
export type MenuStyle = (typeof MENU_STYLES)[number]["value"];

/** How the menu opens on phones (the ☰ button). */
export const MOBILE_MENU_STYLES = [
  { value: "drawer", label: "Side drawer", hint: "Slides in from the left" },
  { value: "fullscreen", label: "Full screen", hint: "Big words over the whole screen" },
  { value: "sheet", label: "Bottom sheet", hint: "Rises from the bottom, easy to reach" },
] as const;
export type MobileMenuStyle = (typeof MOBILE_MENU_STYLES)[number]["value"];

/**
 * The menu's own colours (header settings `menuColors`), over the theme's. Any can be left out to keep the theme's:
 * text = the menu words, accent = the current page and hover line, bar = a band behind the menu on computers,
 * panel / panelText = dropdowns, the mega menu, and the phone drawer or sheet.
 */
export interface MenuColorSet {
  text?: string;
  accent?: string;
  bar?: string;
  panel?: string;
  panelText?: string;
}
export const MENU_COLOR_KEYS = ["text", "accent", "bar", "panel", "panelText"] as const;
/** Where each colour is saved on the header's settings (flat keys, so the builder's colour fields can edit them). */
export const MENU_COLOR_SETTINGS: Record<(typeof MENU_COLOR_KEYS)[number], string> = {
  text: "menuTextColor",
  accent: "menuAccentColor",
  bar: "menuBarColor",
  panel: "menuPanelColor",
  panelText: "menuPanelTextColor",
};

const HEX = /^#[0-9a-f]{6}$/i;

/** The menu colours saved on the header's settings, kept to real #rrggbb values; null when none are set. */
export function readMenuColors(settings: unknown): MenuColorSet | null {
  if (!settings || typeof settings !== "object") return null;
  const out: MenuColorSet = {};
  for (const key of MENU_COLOR_KEYS) {
    const value = (settings as Record<string, unknown>)[MENU_COLOR_SETTINGS[key]];
    if (typeof value === "string" && HEX.test(value.trim())) out[key] = value.trim().toLowerCase();
  }
  return Object.keys(out).length ? out : null;
}

/** The theme's menu colours with the seller's (or Rex's) own on top. */
export function withMenuColors<T extends { ink: string; accent: string; accentText: string; panel: string; panelInk: string; muted: string }>(base: T, custom: MenuColorSet | null | undefined): T & { bar?: string; ownText?: boolean } {
  if (!custom) return base;
  const panelInk = custom.panelText ?? base.panelInk;
  return {
    ...base,
    ink: custom.text ?? base.ink,
    accent: custom.accent ?? base.accent,
    accentText: custom.accent ? readableOn(custom.accent) : base.accentText,
    panel: custom.panel ?? base.panel,
    panelInk,
    muted: custom.panelText ? `color-mix(in srgb, ${panelInk} 70%, transparent)` : base.muted,
    ...(custom.bar ? { bar: custom.bar } : {}),
    ...(custom.text ? { ownText: true } : {}),
  };
}

/** Black or white, whichever reads better on a colour. */
export function readableOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111111" : "#ffffff";
}

export function menuStyleOf(value: unknown): MenuStyle {
  return MENU_STYLES.some((entry) => entry.value === value) ? (value as MenuStyle) : "classic";
}

export function mobileMenuStyleOf(value: unknown): MobileMenuStyle {
  return MOBILE_MENU_STYLES.some((entry) => entry.value === value) ? (value as MobileMenuStyle) : "drawer";
}

/** Page names shoppers can be sent to, with the name they read. */
export const MENU_PAGE_LABELS: Record<string, string> = {
  home: "Home",
  products: "Shop",
  categories: "Categories",
  about: "About",
  contact: "Contact",
  faq: "FAQ",
  blog: "Blog",
  wishlist: "Wishlist",
  cart: "Cart",
  "track-order": "Track order",
};

export const MAX_MENU_ITEMS = 40;
const MAX_LABEL = 60;

let counter = 0;
export function newMenuItemId() {
  counter = (counter + 1) % 1e6;
  return `m${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizePage(raw: string) {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (value === "shop" || value === "catalog" || value === "menu") return "products";
  if (value === "home-page") return "home";
  return value;
}

/** A web address a shopper can safely open: http(s), mailto, tel, WhatsApp or a path on the store. */
export function safeMenuUrl(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^(mailto:|tel:)/i.test(value)) return value;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A CMS collection slug, optionally followed by an item slug: "blog" or "blog/how-to-choose-a-lamp". */
export function isContentRef(ref: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(ref) && ref.length <= 170;
}

/** A readable name from a content path, for a content link the seller didn't name ("size-guide" → "Size guide"). */
export function contentRefName(ref: string) {
  const last = ref.split("/").pop() ?? ref;
  const words = last.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function cleanItem(raw: unknown, depth: number): MenuItem | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const kind = entry.kind;
  if (kind !== "page" && kind !== "category" && kind !== "product" && kind !== "content" && kind !== "link") return null;
  const label = typeof entry.label === "string" ? entry.label.slice(0, MAX_LABEL) : "";
  const item: MenuItem = { id: typeof entry.id === "string" && entry.id ? entry.id : newMenuItemId(), kind, label };
  if (kind === "link") {
    const url = safeMenuUrl(entry.url);
    if (!url) return null;
    item.url = url;
    if (entry.newTab === true) item.newTab = true;
  } else {
    const ref = typeof entry.ref === "string" ? entry.ref.trim() : "";
    if (!ref || (kind === "content" && !isContentRef(ref))) return null;
    item.ref = kind === "page" ? normalizePage(ref) : ref;
  }
  if (typeof entry.image === "string" && /^https:\/\/[^\s"'<>]+$/.test(entry.image) && entry.image.length <= 2000) item.image = entry.image;
  if (depth === 0 && Array.isArray(entry.children)) {
    const children = entry.children.map((child) => cleanItem(child, 1)).filter((child): child is MenuItem => Boolean(child));
    if (children.length) item.children = children;
  }
  return item;
}

/** The menu saved on the header, or one made from the older page list. */
export function readMenu(copy: Record<string, unknown> | null | undefined, fallbackPages: string[] = ["home", "products", "about", "contact"]): MenuItem[] {
  if (Array.isArray(copy?.menu)) {
    return withoutRepeats((copy.menu as unknown[]).map((entry) => cleanItem(entry, 0)).filter((entry): entry is MenuItem => Boolean(entry))).slice(0, MAX_MENU_ITEMS);
  }
  const pages = Array.isArray(copy?.navLinks) ? (copy.navLinks as unknown[]).map(String) : fallbackPages;
  return pages
    .map(normalizePage)
    .filter((page, index, all) => page && all.indexOf(page) === index)
    .map((page) => ({ id: `page-${page}`, kind: "page" as const, ref: page, label: "" }));
}

/** The page names in the menu, top level first (for older code that only knows pages). */
export function menuPageKeys(menu: MenuItem[]): string[] {
  const keys: string[] = [];
  for (const item of menu) {
    if (item.kind === "page" && item.ref && !keys.includes(item.ref)) keys.push(item.ref);
  }
  return keys;
}

export function countMenuItems(menu: MenuItem[]) {
  return menu.reduce((total, item) => total + 1 + (item.children?.length ?? 0), 0);
}

// ─── Editing (the builder's menu editor) ──────────────────────────────────────

type Path = { parent: number | null; index: number };

function locate(menu: MenuItem[], id: string): Path | null {
  for (let i = 0; i < menu.length; i += 1) {
    if (menu[i]!.id === id) return { parent: null, index: i };
    const children = menu[i]!.children ?? [];
    for (let j = 0; j < children.length; j += 1) if (children[j]!.id === id) return { parent: i, index: j };
  }
  return null;
}

function withChildren(item: MenuItem, children: MenuItem[]): MenuItem {
  const next = { ...item };
  if (children.length) next.children = children;
  else delete next.children;
  return next;
}

/** What an item points at ("page:home", "category:audio", "link:https://…"): two items with the same target are one. */
export function menuTarget(item: Pick<MenuItem, "kind" | "ref" | "url">) {
  return `${item.kind}:${item.kind === "link" ? item.url ?? "" : item.ref ?? ""}`;
}

/** The targets already in a menu, sub-items included (pickers show them as added). */
export function menuTargets(menu: MenuItem[]): Set<string> {
  return new Set(menu.flatMap((item) => [item, ...(item.children ?? [])]).map(menuTarget));
}

/**
 * Adds items to the end of the menu, skipping any that are already in it (anywhere) or repeated in `items`.
 * `allowRepeats`: a placeholder the seller re-points straight away (Navigation's "Add item").
 */
export function addMenuItems(menu: MenuItem[], items: Array<Omit<MenuItem, "id">>, options: { allowRepeats?: boolean } = {}): MenuItem[] {
  const room = Math.max(0, MAX_MENU_ITEMS - countMenuItems(menu));
  const have = menuTargets(menu);
  const fresh = options.allowRepeats ? items : items.filter((item) => {
    const target = menuTarget(item);
    if (have.has(target)) return false;
    have.add(target);
    return true;
  });
  return [...menu, ...fresh.slice(0, room).map((item) => ({ ...item, id: newMenuItemId() }))];
}

/**
 * A saved menu without exact repeats: a second item with the same target and the same (or no) name, and no
 * sub-items of its own, is dropped. Menus saved before addMenuItems skipped repeats read clean (and save clean).
 */
export function withoutRepeats(menu: MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  return menu.filter((item) => {
    const key = `${menuTarget(item)}|${item.label.trim().toLowerCase()}`;
    if (seen.has(key) && !item.children?.length) return false;
    seen.add(key);
    return true;
  });
}

export function updateMenuItem(menu: MenuItem[], id: string, patch: Partial<Omit<MenuItem, "id" | "children">>): MenuItem[] {
  return menu.map((item) => {
    if (item.id === id) return { ...item, ...patch };
    if (!item.children?.some((child) => child.id === id)) return item;
    return { ...item, children: item.children.map((child) => (child.id === id ? { ...child, ...patch } : child)) };
  });
}

/** Removes an item. Its sub-items move up into its place, as in WordPress. */
export function removeMenuItem(menu: MenuItem[], id: string): MenuItem[] {
  const at = locate(menu, id);
  if (!at) return menu;
  if (at.parent === null) {
    const item = menu[at.index]!;
    return [...menu.slice(0, at.index), ...(item.children ?? []), ...menu.slice(at.index + 1)];
  }
  return menu.map((item, index) => (index === at.parent ? withChildren(item, (item.children ?? []).filter((child) => child.id !== id)) : item));
}

/** Up or down among its neighbours (same level). */
export function moveMenuItem(menu: MenuItem[], id: string, direction: -1 | 1): MenuItem[] {
  const at = locate(menu, id);
  if (!at) return menu;
  const swap = <T,>(list: T[], from: number, to: number) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
  };
  if (at.parent === null) return swap(menu, at.index, at.index + direction);
  return menu.map((item, index) => (index === at.parent ? { ...item, children: swap(item.children ?? [], at.index, at.index + direction) } : item));
}

/** Can this item go under the one above it? Top-level, not first, and without sub-items of its own. */
export function canIndentMenuItem(menu: MenuItem[], id: string) {
  const at = locate(menu, id);
  return Boolean(at && at.parent === null && at.index > 0 && !menu[at.index]!.children?.length);
}

/** Makes the item a sub-item of the one above it (the end of its dropdown). */
export function indentMenuItem(menu: MenuItem[], id: string): MenuItem[] {
  if (!canIndentMenuItem(menu, id)) return menu;
  const at = locate(menu, id)!;
  const item = menu[at.index]!;
  const parent = menu[at.index - 1]!;
  const next = [...menu];
  next[at.index - 1] = withChildren(parent, [...(parent.children ?? []), item]);
  next.splice(at.index, 1);
  return next;
}

/** Takes a sub-item out of its dropdown, placing it just after its parent. Sub-items below it go with it. */
export function outdentMenuItem(menu: MenuItem[], id: string): MenuItem[] {
  const at = locate(menu, id);
  if (!at || at.parent === null) return menu;
  const parent = menu[at.parent]!;
  const children = parent.children ?? [];
  const item = children[at.index]!;
  const after = children.slice(at.index + 1);
  const next = [...menu];
  next[at.parent] = withChildren(parent, children.slice(0, at.index));
  next.splice(at.parent + 1, 0, withChildren(item, after));
  return next;
}

/** Moves an item (with its sub-items) to the top level at `index`, or under `parentId` at `index`. For drag and drop. */
export function placeMenuItem(menu: MenuItem[], id: string, target: { parentId: string | null; index: number }): MenuItem[] {
  const at = locate(menu, id);
  if (!at || target.parentId === id) return menu;
  const item = at.parent === null ? menu[at.index]! : menu[at.parent]!.children![at.index]!;
  // An item with sub-items can't itself become a sub-item (one level of dropdowns).
  if (target.parentId && item.children?.length) return menu;
  let rest = at.parent === null ? menu.filter((entry) => entry.id !== id) : menu.map((entry, index) => (index === at.parent ? withChildren(entry, (entry.children ?? []).filter((child) => child.id !== id)) : entry));
  if (!target.parentId) {
    const index = Math.max(0, Math.min(target.index, rest.length));
    rest = [...rest.slice(0, index), item, ...rest.slice(index)];
    return rest;
  }
  return rest.map((entry) => {
    if (entry.id !== target.parentId) return entry;
    const children = entry.children ?? [];
    const index = Math.max(0, Math.min(target.index, children.length));
    return { ...entry, children: [...children.slice(0, index), item, ...children.slice(index)] };
  });
}
