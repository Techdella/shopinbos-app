// Pure helpers for the advanced builder: undo history, section moves, the page list and the insert catalogue.
// Only relative .ts runtime imports, so tests/behaviour.test.mjs can load this file directly with Node's type stripping.

import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode } from "@/lib/store-templates";
import { STORE_BLOCKS, newStoreBlockSection, type BlockCategory, type BlockIcon } from "../../storefront/boutique/blocks/block-catalog.ts";
import { LAYOUT_ROW_KIND, layoutElementLabel, newLayoutRowSection, normaliseLayoutRow } from "../../storefront/boutique/blocks/layout-logic.ts";
import { fillMissingPageSeo } from "../../../lib/store-templates/seo-defaults.ts";

// ─── Undo history ────────────────────────────────────────────────────────────

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Edits with the same key inside the merge window become one undo step (typing a heading). */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const HISTORY_MERGE_MS = 1200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function pushHistory<T>(
  history: History<T>,
  next: T,
  options: { key?: string | null; now?: number; limit?: number; mergeMs?: number } = {},
): History<T> {
  const now = options.now ?? Date.now();
  const key = options.key ?? null;
  const merge = key !== null && key === history.lastKey && now - history.lastAt < (options.mergeMs ?? HISTORY_MERGE_MS);
  if (merge) return { past: history.past, present: next, future: [], lastKey: key, lastAt: now };
  const limit = options.limit ?? HISTORY_LIMIT;
  const past = [...history.past, history.present];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present: next, future: [], lastKey: key, lastAt: now };
}

export function canUndo<T>(history: History<T>) {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>) {
  return history.future.length > 0;
}

export function undoHistory<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1] as T;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future], lastKey: null, lastAt: 0 };
}

export function redoHistory<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  const [next, ...rest] = history.future as [T, ...T[]];
  return { past: [...history.past, history.present], present: next, future: rest, lastKey: null, lastAt: 0 };
}

// ─── Section groups ──────────────────────────────────────────────────────────

export type SectionGroup = "header" | "overlays" | "template" | "footer";

export const HEADER_KINDS = ["announcement-bar", "header"];
export const FOOTER_KINDS = ["footer"];
export const OVERLAY_KINDS = ["cart-drawer", "newsletter-popup"];
/** Sections a page can only have one of. */
export const SINGLE_KINDS = [...HEADER_KINDS, ...FOOTER_KINDS];

export function sectionGroup(kind: string): SectionGroup {
  if (HEADER_KINDS.includes(kind)) return "header";
  if (FOOTER_KINDS.includes(kind)) return "footer";
  if (OVERLAY_KINDS.includes(kind)) return "overlays";
  return "template";
}

export const GROUP_LABELS: Record<SectionGroup, string> = {
  header: "Header",
  overlays: "Overlays",
  template: "Template",
  footer: "Footer",
};

export function groupSections(sections: TemplateSectionNode[]) {
  const order: SectionGroup[] = ["header", "overlays", "template", "footer"];
  return order
    .map((group) => ({ group, sections: sections.filter((section) => sectionGroup(section.kind) === group) }))
    .filter((entry) => entry.group !== "overlays" || entry.sections.length > 0);
}

function neighbourIndex(sections: TemplateSectionNode[], index: number, direction: "up" | "down") {
  const group = sectionGroup(sections[index]!.kind);
  const step = direction === "up" ? -1 : 1;
  for (let i = index + step; i >= 0 && i < sections.length; i += step) {
    if (sectionGroup(sections[i]!.kind) === group) return i;
  }
  return -1;
}

export function canMoveSection(sections: TemplateSectionNode[], id: string, direction: "up" | "down") {
  const index = sections.findIndex((section) => section.id === id);
  return index !== -1 && neighbourIndex(sections, index, direction) !== -1;
}

/** Swaps a section with its neighbour in the same group; header and footer sections never cross into the page body. */
export function moveSection(sections: TemplateSectionNode[], id: string, direction: "up" | "down") {
  const index = sections.findIndex((section) => section.id === id);
  if (index === -1) return sections;
  const target = neighbourIndex(sections, index, direction);
  if (target === -1) return sections;
  const next = [...sections];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Drag and drop: places a section before or after another section of the same group. */
export function moveSectionTo(sections: TemplateSectionNode[], id: string, targetId: string, place: "before" | "after") {
  if (id === targetId) return sections;
  const moving = sections.find((section) => section.id === id);
  const target = sections.find((section) => section.id === targetId);
  if (!moving || !target || sectionGroup(moving.kind) !== sectionGroup(target.kind)) return sections;
  const rest = sections.filter((section) => section.id !== id);
  const targetIndex = rest.findIndex((section) => section.id === targetId);
  rest.splice(place === "before" ? targetIndex : targetIndex + 1, 0, moving);
  return rest;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function canDuplicateSection(section: Pick<TemplateSectionNode, "kind">) {
  return !SINGLE_KINDS.includes(section.kind);
}

export function duplicateSection(sections: TemplateSectionNode[], id: string, newId: string) {
  const index = sections.findIndex((section) => section.id === id);
  const source = sections[index];
  if (!source || !canDuplicateSection(source)) return sections;
  const copy = clone(source);
  copy.id = newId;
  copy.name = `${source.name} copy`;
  copy.blocks = copy.blocks.map((block, blockIndex) => ({ ...block, id: `${newId}-${block.type}-${blockIndex}` }));
  const next = [...sections];
  next.splice(index + 1, 0, copy);
  return next;
}

export function setSectionHidden(sections: TemplateSectionNode[], id: string, hidden: boolean) {
  return sections.map((section) => (section.id === id ? { ...section, visible: !hidden } : section));
}

export function toggleSectionHidden(sections: TemplateSectionNode[], id: string) {
  const section = sections.find((entry) => entry.id === id);
  return section ? setSectionHidden(sections, id, section.visible !== false) : sections;
}

export function removeSection(sections: TemplateSectionNode[], id: string) {
  return sections.filter((section) => section.id !== id);
}

export function updateSection(sections: TemplateSectionNode[], id: string, updater: (section: TemplateSectionNode) => TemplateSectionNode) {
  return sections.map((section) => (section.id === id ? updater(section) : section));
}

/**
 * Inserts before `beforeId`. Without one, header kinds go after the existing header sections and everything else
 * goes at the end of the page body, above the footer.
 */
export function insertSection(sections: TemplateSectionNode[], section: TemplateSectionNode, beforeId: string | null) {
  const next = [...sections];
  let index = beforeId ? next.findIndex((entry) => entry.id === beforeId) : -1;
  if (index !== -1 && sectionGroup(next[index]!.kind) === "header" && sectionGroup(section.kind) !== "header") index = -1;
  if (index === -1) {
    const group = sectionGroup(section.kind);
    if (group === "header") {
      let last = -1;
      next.forEach((entry, i) => { if (sectionGroup(entry.kind) === "header") last = i; });
      index = last + 1;
    } else if (group === "footer") {
      index = next.length;
    } else {
      const footer = next.findIndex((entry) => sectionGroup(entry.kind) === "footer");
      index = footer === -1 ? next.length : footer;
    }
  }
  next.splice(index, 0, section);
  return next;
}

// ─── Canvas insert spots ─────────────────────────────────────────────────────

/** A "+" spot on the builder canvas: between two sections the shopper sees, never above the header or below the footer. */
export interface InsertSlot {
  key: string;
  /** Where the new section lands in the page's full section list (hidden sections included). */
  index: number;
  /** Section drawn just above the spot (the last header section for the first spot), or null. */
  afterId: string | null;
  /** Section the new one goes before (a body section or the footer), or null for the end of the page. */
  beforeId: string | null;
}

/** First and last positions a body section may take: after every header section, before the first footer. */
export function insertBounds(sections: Array<Pick<TemplateSectionNode, "kind">>) {
  let min = 0;
  sections.forEach((section, index) => { if (sectionGroup(section.kind) === "header") min = index + 1; });
  const footer = sections.findIndex((section) => sectionGroup(section.kind) === "footer");
  const max = footer === -1 ? sections.length : Math.max(min, footer);
  return { min, max };
}

export function clampInsertIndex(sections: Array<Pick<TemplateSectionNode, "kind">>, index: number) {
  const { min, max } = insertBounds(sections);
  const whole = Number.isFinite(index) ? Math.round(index) : max;
  return Math.min(max, Math.max(min, whole));
}

/** Puts a body section at `index`, kept between the header and the footer. */
export function insertSectionAt(sections: TemplateSectionNode[], section: TemplateSectionNode, index: number) {
  const next = [...sections];
  next.splice(clampInsertIndex(sections, index), 0, section);
  return next;
}

/** The canvas "+" spots of a page, top to bottom: one above each visible body section and one at the end. */
export function insertSlots(sections: TemplateSectionNode[]): InsertSlot[] {
  const shown = (section: TemplateSectionNode) => section.visible !== false;
  const body = sections.filter((section) => shown(section) && sectionGroup(section.kind) !== "header" && sectionGroup(section.kind) !== "footer");
  const header = sections.filter((section) => shown(section) && sectionGroup(section.kind) === "header");
  const footer = sections.find((section) => sectionGroup(section.kind) === "footer") ?? null;
  const { max } = insertBounds(sections);
  const slots: InsertSlot[] = [];
  for (let i = 0; i <= body.length; i += 1) {
    const before = body[i] ?? null;
    const after = body[i - 1] ?? header[header.length - 1] ?? null;
    slots.push({
      key: `slot:${before?.id ?? "end"}`,
      index: before ? sections.indexOf(before) : max,
      afterId: after?.id ?? null,
      beforeId: before?.id ?? footer?.id ?? null,
    });
  }
  return slots;
}

/** The spot right below a section (the floating toolbar's "Add below"); null for the footer. */
export function slotBelow(sections: TemplateSectionNode[], id: string): InsertSlot | null {
  const section = sections.find((entry) => entry.id === id);
  if (!section || sectionGroup(section.kind) === "footer") return null;
  const slots = insertSlots(sections);
  if (sectionGroup(section.kind) === "header") return slots[0] ?? null;
  return slots.find((slot) => slot.afterId === id) ?? null;
}

// ─── Snapshot helpers ────────────────────────────────────────────────────────

export function findPage(snapshot: StoreEditorSnapshot | null, pageType: string): TemplatePageSeed | null {
  if (!snapshot) return null;
  return snapshot.pages.find((page) => page.pageType === pageType) ?? null;
}

export function updatePageSections(
  snapshot: StoreEditorSnapshot,
  pageType: string,
  updater: (sections: TemplateSectionNode[]) => TemplateSectionNode[],
): StoreEditorSnapshot {
  let changed = false;
  const pages = snapshot.pages.map((page) => {
    if (page.pageType !== pageType) return page;
    const sections = updater(page.sections);
    if (sections === page.sections) return page;
    changed = true;
    return { ...page, sections };
  });
  return changed ? { ...snapshot, pages } : snapshot;
}

/** Comparable form of a snapshot: the save timestamp is not a change. */
export function snapshotKey(snapshot: StoreEditorSnapshot | null | undefined) {
  if (!snapshot) return "";
  const { updatedAt: _updatedAt, ...rest } = snapshot;
  return JSON.stringify(rest);
}

export function sameSnapshot(a: StoreEditorSnapshot | null | undefined, b: StoreEditorSnapshot | null | undefined) {
  return snapshotKey(a) === snapshotKey(b);
}

/**
 * The builder's status pill. draft: never published. live: shoppers see exactly this draft. changes: the draft
 * differs from what was published. offline: published, but the store itself is closed (Store.status not active).
 */
export type PublishState = "draft" | "live" | "changes" | "offline";

/**
 * Publishing fills in blank page search titles and descriptions from the store name (seo-defaults.ts), so the
 * published copy can hold SEO text the seller's draft leaves blank. That alone isn't an unpublished change: with
 * the store name, the draft is compared as publishing would have saved it.
 */
export function publishState(
  draft: StoreEditorSnapshot | null,
  published: StoreEditorSnapshot | null,
  options: { storeName?: string; storeLive?: boolean } = {},
): PublishState {
  if (!published) return "draft";
  const same = sameSnapshot(draft, published)
    || (Boolean(draft) && options.storeName !== undefined && sameSnapshot(fillMissingPageSeo(draft!, options.storeName), published));
  if (!same) return "changes";
  return options.storeLive === false ? "offline" : "live";
}

/** Swaps the current snapshot without adding an undo step (the server's copy of the same edits). */
export function replacePresent<T>(history: History<T>, present: T): History<T> {
  return { ...history, present };
}

// ─── Section copy and blocks ─────────────────────────────────────────────────

export function sectionCopy(section: TemplateSectionNode | null | undefined): Record<string, unknown> {
  return (section?.blocks.find((block) => block.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

export function setSectionCopy(section: TemplateSectionNode, key: string, value: unknown): TemplateSectionNode {
  const hasCopy = section.blocks.some((block) => block.type === "copy");
  if (!hasCopy) {
    return { ...section, blocks: [{ id: `${section.id}-copy`, type: "copy", content: { [key]: value } }, ...section.blocks] };
  }
  let done = false;
  return {
    ...section,
    blocks: section.blocks.map((block) => {
      if (done || block.type !== "copy") return block;
      done = true;
      return { ...block, content: { ...block.content, [key]: value } };
    }),
  };
}

export function setSectionSetting(section: TemplateSectionNode, key: string, value: unknown): TemplateSectionNode {
  return { ...section, settings: { ...(section.settings ?? {}), [key]: value } };
}

export interface SectionBlockRow {
  id: string;
  label: string;
  icon: "text" | "button" | "image" | "item";
  /** Inspector field to focus (copy key), or the item index for list blocks. */
  field?: string;
  itemIndex?: number;
}

const COPY_BLOCKS: Array<{ keys: string[]; label: string; icon: SectionBlockRow["icon"] }> = [
  { keys: ["logoText"], label: "Logo", icon: "text" },
  { keys: ["text"], label: "Message", icon: "text" },
  { keys: ["eyebrow"], label: "Eyebrow", icon: "text" },
  { keys: ["title"], label: "Heading", icon: "text" },
  { keys: ["body", "summary"], label: "Text", icon: "text" },
  { keys: ["discountLabel"], label: "Discount", icon: "text" },
  { keys: ["primaryCta", "cta", "buttonLabel"], label: "Button", icon: "button" },
];

function itemLabel(item: Record<string, unknown>, index: number) {
  for (const key of ["question", "title", "label", "quote", "person"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim().length > 40 ? `${value.trim().slice(0, 38)}…` : value.trim();
  }
  if (typeof item.mappedStoreProductId === "string") return "Picked product";
  if (typeof item.imageUrl === "string" && item.imageUrl) return `Image ${index + 1}`;
  return `Item ${index + 1}`;
}

/** The blocks shown under a section in the sections tree, in reading order. */
export function sectionBlocks(section: TemplateSectionNode): SectionBlockRow[] {
  if (section.kind === LAYOUT_ROW_KIND) {
    return normaliseLayoutRow(section).cells.flatMap((cell) => cell.elements.map((element): SectionBlockRow => ({
      id: `${section.id}:${element.id}`,
      label: layoutElementLabel(element),
      icon: element.type === "image" || element.type === "video" ? "image" : element.type === "button" ? "button" : element.type === "heading" || element.type === "text" ? "text" : "item",
      field: `element:${element.id}`,
    })));
  }
  const copy = sectionCopy(section);
  const rows: SectionBlockRow[] = [];
  for (const entry of COPY_BLOCKS) {
    const key = entry.keys.find((candidate) => candidate in copy);
    if (key) rows.push({ id: `${section.id}:${key}`, label: entry.label, icon: entry.icon, field: key });
  }
  for (const block of section.blocks) {
    if (block.type === "image") rows.push({ id: `${section.id}:${block.id}`, label: "Image", icon: "image", field: `image:${block.id}` });
  }
  (section.items ?? []).forEach((item, index) => {
    rows.push({ id: `${section.id}:item-${index}`, label: itemLabel(item, index), icon: typeof item.imageUrl === "string" && !item.title ? "image" : "item", itemIndex: index });
  });
  return rows;
}

// ─── Page picker ─────────────────────────────────────────────────────────────

export interface PageEntry {
  id: string;
  label: string;
  /** Snapshot page the canvas shows. */
  pageType: string;
  productId?: string;
  collectionId?: string;
  children?: PageEntry[];
}

const FIXED_PAGE_TYPES = new Set(["home", "products", "product", "cart", "checkout"]);

export function buildPageList(input: {
  pages: Array<{ pageType: string; title: string }>;
  products: Array<{ id: string; name: string }>;
  collections: Array<{ id: string; name: string }>;
}): PageEntry[] {
  const has = (pageType: string) => input.pages.some((page) => page.pageType === pageType);
  const list: PageEntry[] = [];
  if (has("home")) list.push({ id: "home", label: "Home page", pageType: "home" });
  if (has("products") || has("product")) {
    const children: PageEntry[] = [];
    if (has("products")) children.push({ id: "products", label: "All products", pageType: "products" });
    if (has("product")) {
      for (const product of input.products) children.push({ id: `product:${product.id}`, label: product.name, pageType: "product", productId: product.id });
    }
    list.push({ id: "group:products", label: "Products", pageType: has("products") ? "products" : "product", children });
  }
  if (has("products") && input.collections.length) {
    list.push({
      id: "group:collections",
      label: "Collections",
      pageType: "products",
      children: input.collections.map((collection) => ({ id: `collection:${collection.id}`, label: collection.name, pageType: "products", collectionId: collection.id })),
    });
  }
  const others = input.pages.filter((page) => !FIXED_PAGE_TYPES.has(page.pageType));
  if (others.length) {
    list.push({
      id: "group:pages",
      label: "Pages",
      pageType: others[0]!.pageType,
      children: others.map((page) => ({ id: page.pageType, label: page.title || page.pageType, pageType: page.pageType })),
    });
  }
  if (has("cart")) list.push({ id: "cart", label: "Cart", pageType: "cart" });
  if (has("checkout")) list.push({ id: "checkout", label: "Checkout", pageType: "checkout" });
  return list;
}

/** Every selectable entry whose name matches, children included. */
export function searchPageList(list: PageEntry[], query: string): PageEntry[] {
  const q = query.trim().toLowerCase();
  const flat: PageEntry[] = [];
  for (const entry of list) {
    if (entry.children) {
      for (const child of entry.children) flat.push(child);
    } else {
      flat.push(entry);
    }
  }
  return q ? flat.filter((entry) => entry.label.toLowerCase().includes(q)) : flat;
}

export function findPageEntry(list: PageEntry[], id: string): PageEntry | null {
  for (const entry of list) {
    if (entry.id === id) return entry;
    const child = entry.children?.find((candidate) => candidate.id === id);
    if (child) return child;
  }
  return null;
}

// ─── Insert catalogue ────────────────────────────────────────────────────────

export type RendererKind = "boutique" | "classic";

export interface InsertItem {
  kind: string;
  label: string;
  group: "Header" | BlockCategory;
  hint: string;
  renderers: RendererKind[];
  /** Ready-made blocks show their own icon in the Insert panel. */
  icon?: BlockIcon;
}

const BOTH: RendererKind[] = ["boutique", "classic"];

export const INSERT_CATALOG: InsertItem[] = [
  { kind: "announcement-bar", label: "Announcement bar", group: "Header", hint: "A thin message above the header.", renderers: BOTH },
  { kind: "header", label: "Header", group: "Header", hint: "Logo, menu and bag.", renderers: BOTH },
  { kind: "hero-split", label: "Image banner", group: "Banners", hint: "Big photo with a headline and button.", renderers: BOTH },
  { kind: "payday-countdown", label: "Countdown timer", group: "Banners", hint: "Counts down to your payday sale.", renderers: ["boutique"] },
  { kind: "page-header", label: "Page title banner", group: "Banners", hint: "The page's name and a Home / page trail at the top of a page.", renderers: ["boutique"] },
  { kind: "promo-banner", label: "Promo banner", group: "Banners", hint: "An offer with a button.", renderers: ["classic"] },
  { kind: "trust-strip", label: "Trust bar", group: "Banners", hint: "Delivery, payment and support promises.", renderers: ["classic"] },
  { kind: "featured-products", label: "Featured collection", group: "Products", hint: "Best sellers or products you pick.", renderers: BOTH },
  { kind: "category-grid", label: "Collection list", group: "Products", hint: "Tiles for your collections and categories.", renderers: BOTH },
  { kind: "story-split", label: "Image with text", group: "Story", hint: "Your story beside a photo.", renderers: BOTH },
  { kind: "text-columns", label: "Text columns", group: "Story", hint: "Short points side by side.", renderers: ["classic"] },
  { kind: "testimonials", label: "Testimonials", group: "Story", hint: "Reviews from customers.", renderers: BOTH },
  { kind: "faq", label: "Questions", group: "Story", hint: "Answers to common questions.", renderers: BOTH },
  { kind: "about-section", label: "About", group: "Story", hint: "Who you are and what you stand for.", renderers: ["classic"] },
  { kind: "delivery-info", label: "Delivery info", group: "Story", hint: "How and when orders arrive.", renderers: ["classic"] },
  { kind: "payment-info", label: "Payment info", group: "Story", hint: "How shoppers can pay.", renderers: ["classic"] },
  { kind: "newsletter", label: "Newsletter", group: "Grow", hint: "Collect emails and WhatsApp numbers.", renderers: BOTH },
  { kind: "contact-form", label: "Contact form", group: "Grow", hint: "A message form and WhatsApp button.", renderers: BOTH },
  { kind: "blog-index", label: "Blog posts", group: "Grow", hint: "Your latest articles.", renderers: ["classic"] },
  { kind: "spin-wheel", label: "Spin the wheel", group: "Grow", hint: "A prize wheel pop-up that collects emails and WhatsApp numbers.", renderers: BOTH },
  { kind: "scratch-card", label: "Scratch card", group: "Grow", hint: "Shoppers scratch to reveal a mystery discount.", renderers: BOTH },
  { kind: "reward-progress", label: "Reward progress", group: "Grow", hint: "How close the bag is to free delivery and rewards.", renderers: BOTH },
  { kind: "loyalty-banner", label: "Loyalty points", group: "Grow", hint: "How points work, the tiers and a balance check.", renderers: BOTH },
  // Ready-made blocks for the 2026 themes (src/components/storefront/boutique/blocks/block-catalog.ts).
  ...STORE_BLOCKS.map((block): InsertItem => ({ kind: block.kind, label: block.label, group: block.category, hint: block.description, renderers: ["boutique"], icon: block.icon })),
];

export const INSERT_GROUP_ORDER: InsertItem["group"][] = ["Header", "Banners", "Products", "Trust", "Story", "Grow", "Extras"];

/** Sections that fit the spot: header sections only into the header (and only when missing), body sections elsewhere. */
export function insertOptions(input: { renderer: RendererKind; target: SectionGroup; existingKinds: string[]; query?: string }) {
  const q = (input.query ?? "").trim().toLowerCase();
  const items = INSERT_CATALOG.filter((item) => {
    if (!item.renderers.includes(input.renderer)) return false;
    const group = sectionGroup(item.kind);
    if (input.target === "header") {
      if (group !== "header" || input.existingKinds.includes(item.kind)) return false;
    } else if (group !== "template") {
      return false;
    }
    return !q || `${item.label} ${item.hint} ${item.group}`.toLowerCase().includes(q);
  });
  return INSERT_GROUP_ORDER
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
}

export function insertLabel(kind: string) {
  if (kind === LAYOUT_ROW_KIND) return "Columns";
  return INSERT_CATALOG.find((item) => item.kind === kind)?.label ?? kind.replace(/-/g, " ");
}

/** Starter content for the 2026 themes: no stock photos, made-up reviews or offers (same rules as the theme seeds). */
export function newBoutiqueSection(kind: string, id: string): TemplateSectionNode {
  const make = (name: string, copy: Record<string, unknown>, extra: Partial<TemplateSectionNode> = {}): TemplateSectionNode => ({
    id,
    kind,
    name,
    visible: true,
    blocks: [{ id: `${id}-copy`, type: "copy", content: copy }],
    ...extra,
  });
  const block = newStoreBlockSection(kind, id);
  if (block) return block;
  if (kind === LAYOUT_ROW_KIND) return newLayoutRowSection(id);
  switch (kind) {
    case "announcement-bar":
      return make("Announcement bar", { text: "" }, { settings: { source: "store-settings" } });
    case "header":
      return make("Header", { navLinks: ["home", "products", "about", "contact"], utilityLinks: ["wishlist", "cart"], cartLabel: "My bag" }, { settings: { layout: "split", search: true, wishlist: true, cart: true } });
    case "footer":
      return make("Footer", { summary: "" }, { settings: { layout: "boutique", showPayments: true } });
    case "hero-split":
      return make("Image banner", { eyebrow: "", title: "New season", body: "", primaryCta: "Shop now" }, { items: [], settings: { primaryButtonAction: "products" } });
    case "page-header":
      return make("Page title banner", { title: "", body: "" }, { items: [], settings: { layout: "tinted" } });
    case "payday-countdown":
      return make("Countdown timer", { eyebrow: "Payday edit", title: "", discountLabel: "", body: "", primaryCta: "Shop the edit" }, { settings: { paydayRule: "day-of-month", paydayDay: 25, weekendToFriday: true, saleEnds: "sunday", saleDays: 3 } });
    case "featured-products":
      return make("Featured collection", { title: "Best sellers", cta: "Shop all" }, { items: [], settings: { layout: "carousel", source: "best-sellers", allowMapping: true } });
    case "category-grid":
      return make("Collection list", { title: "Shop by category" }, { settings: { source: "store-categories" } });
    case "testimonials":
      return make("Testimonials", { title: "What customers say" }, { items: [], settings: { source: "product-reviews" } });
    case "story-split":
      return make("Image with text", { eyebrow: "", title: "Our story", body: "", primaryCta: "Our story" }, { items: [] });
    case "faq":
      return make("Questions", { title: "Questions" }, {
        items: [
          { question: "How fast is delivery?", answer: "", answerSource: "delivery" },
          { question: "Can I pay on delivery?", answer: "", answerSource: "payment" },
        ],
      });
    case "newsletter":
      return make("Newsletter", { title: "Subscribe to new drops", body: "", buttonLabel: "Subscribe", placeholder: "WhatsApp number or email" });
    case "contact-form":
      return make("Contact form", { title: "Get in touch", body: "", buttonLabel: "Send message" });
    // Reward sections: same starters as gameSectionDefaults() in src/lib/gamification/logic.ts (tests check).
    case "spin-wheel":
      return make("Spin the wheel", { title: "", body: "", buttonLabel: "Spin the wheel" }, { settings: { display: "popup", trigger: "delay", delaySeconds: 8, scrollPercent: 50 } });
    case "scratch-card":
      return make("Scratch card", { title: "", body: "", buttonLabel: "Scratch to reveal" }, { settings: { display: "inline", trigger: "scroll", delaySeconds: 8, scrollPercent: 50 } });
    case "reward-progress":
      return make("Reward progress", { title: "" }, { settings: {} });
    case "loyalty-banner":
      return make("Loyalty points", { title: "Earn points every time you shop", body: "" }, { settings: {} });
    default:
      return make(insertLabel(kind), { title: "", body: "" });
  }
}

// ─── Apps ────────────────────────────────────────────────────────────────────

export interface EditorApp {
  id: string;
  label: string;
  description: string;
  /** The section the app adds to the home page. */
  kind: string;
}

export const EDITOR_APPS: EditorApp[] = [
  { id: "reviews", label: "Customer reviews", description: "Stars and reviews from real orders", kind: "testimonials" },
  { id: "countdown", label: "Countdown timer", description: "Counts down to your payday sale", kind: "payday-countdown" },
];

export function appEnabled(sections: TemplateSectionNode[], app: EditorApp) {
  return sections.some((section) => section.kind === app.kind && section.visible !== false);
}

/**
 * Turning an app on shows its section (adding one after the first banner if the page has none); turning it off
 * hides it, so the seller's settings come back if they switch it on again.
 */
export function setAppEnabled(sections: TemplateSectionNode[], app: EditorApp, on: boolean, newId: string) {
  const existing = sections.filter((section) => section.kind === app.kind);
  if (!on) return existing.reduce((list, section) => setSectionHidden(list, section.id, true), sections);
  if (existing.length) return setSectionHidden(sections, existing[0]!.id, false);
  const section = newBoutiqueSection(app.kind, newId);
  const banner = sections.findIndex((entry) => entry.kind === "hero-split");
  const before = banner !== -1 ? sections[banner + 1]?.id ?? null : null;
  return insertSection(sections, section, before);
}
