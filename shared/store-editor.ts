// The phone's store editor (apps/mobile/src/app/store-editor.tsx, design SE-00…SE-16): the pure part, shared by the
// phone, the editor canvas page the phone shows in a WebView (src/app/store-canvas) and the server routes
// (src/app/api/mobile/store-editor). The draft is the web builder's own (brandSettings.editor.draft): the phone edits
// the same snapshot, keeps its own undo history of whole snapshots, autosaves it with a version check, and publishes
// through the same publishStoreDraft as the web builder. Only relative .ts imports, so the tests load this file with
// Node's type stripping (tests/mobile-store-editor.test.mjs).

import { customPageSlug } from "./storefront-pages.ts";

// ─── Snapshot shapes (structurally the web's StoreEditorSnapshot) ────────────

export interface EdBlock {
  id: string;
  type: string;
  content: Record<string, unknown>;
  styles?: Record<string, string | undefined>;
}

export interface EdSection {
  id: string;
  kind: string;
  name: string;
  visible: boolean;
  blocks: EdBlock[];
  items?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
  styles?: Record<string, string | undefined>;
  background?: Record<string, string | undefined>;
}

export interface EdPage {
  id: string;
  pageType: string;
  title: string;
  slug: string;
  sections: EdSection[];
  seo?: Record<string, unknown>;
}

export interface EdSnapshot {
  templateId: string;
  templateName: string;
  layoutFamily?: string;
  themeTokens: Record<string, unknown>;
  pages: EdPage[];
  updatedAt: string;
  [key: string]: unknown;
}

export type Renderer = "boutique" | "classic";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const str = (value: unknown) => (typeof value === "string" ? value : "");

// ─── Undo history: whole snapshots, typing merged into one step ─────────────

export interface EdHistory<T> {
  past: T[];
  present: T;
  future: T[];
  /** Edits with the same key inside the merge window are one undo step. */
  lastKey: string | null;
  lastAt: number;
}

export const HISTORY_LIMIT = 60;
export const HISTORY_MERGE_MS = 1500;

export function createHistory<T>(present: T): EdHistory<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function pushHistory<T>(history: EdHistory<T>, next: T, options: { key?: string | null; now?: number } = {}): EdHistory<T> {
  const now = options.now ?? Date.now();
  const key = options.key ?? null;
  if (key !== null && key === history.lastKey && now - history.lastAt < HISTORY_MERGE_MS) {
    return { past: history.past, present: next, future: [], lastKey: key, lastAt: now };
  }
  const past = [...history.past, history.present];
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, present: next, future: [], lastKey: key, lastAt: now };
}

export const canUndo = <T>(history: EdHistory<T>) => history.past.length > 0;
export const canRedo = <T>(history: EdHistory<T>) => history.future.length > 0;

export function undoHistory<T>(history: EdHistory<T>): EdHistory<T> {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1] as T, future: [history.present, ...history.future], lastKey: null, lastAt: 0 };
}

export function redoHistory<T>(history: EdHistory<T>): EdHistory<T> {
  if (!history.future.length) return history;
  const [next, ...rest] = history.future as [T, ...T[]];
  return { past: [...history.past, history.present], present: next, future: rest, lastKey: null, lastAt: 0 };
}

/** The server's copy of the same edits (a new version stamp): no new undo step. */
export function replacePresent<T>(history: EdHistory<T>, present: T): EdHistory<T> {
  return { ...history, present };
}

// ─── Saving: debounced autosave with a version check ─────────────────────────

/** How long the phone waits after the last change before saving the draft. */
export const AUTOSAVE_MS = 1200;

/** Comparable form of a snapshot: the save stamp isn't a change. */
export function snapshotKey(snapshot: EdSnapshot | null | undefined) {
  if (!snapshot) return "";
  const { updatedAt: _updatedAt, ...rest } = snapshot;
  return JSON.stringify(rest);
}

export const sameSnapshot = (a: EdSnapshot | null | undefined, b: EdSnapshot | null | undefined) => snapshotKey(a) === snapshotKey(b);

/**
 * The version a save is checked against: the draft's own save stamp (the web builder stamps every edit too). A save
 * whose base is older than what the server holds is refused (409), so an edit on the computer is never overwritten
 * by a phone that hadn't seen it.
 */
export function draftVersion(snapshot: { updatedAt?: unknown } | null | undefined): string {
  return str(snapshot?.updatedAt);
}

export function versionConflict(serverVersion: string, baseVersion: string | null | undefined) {
  if (!baseVersion) return false;
  return Boolean(serverVersion) && serverVersion !== baseVersion;
}

export type SaveStatus = "idle" | "saving" | "saved" | "offline" | "conflict";

/** The words under the page name (design SE-02, SE-04): nothing changed yet, saving, saved, or kept on the phone. */
export function statusKey(status: SaveStatus, edited: boolean): "status.live" | "status.saving" | "status.saved" | "status.offline" | "status.conflict" {
  if (status === "saving") return "status.saving";
  if (status === "offline") return "status.offline";
  if (status === "conflict") return "status.conflict";
  return edited ? "status.saved" : "status.live";
}

/** Where the phone keeps an unsaved draft so nothing is lost when the network drops or the app closes. */
export const draftBackupKey = (storeId: string) => `shopinbos.storeEditor.draft.${storeId}`;

export interface DraftBackup {
  storeId: string;
  baseVersion: string;
  snapshot: EdSnapshot;
  savedAt: number;
}

/** A backup worth restoring: same store, made from the draft the server still has, and different from it. */
export function usableBackup(backup: DraftBackup | null, storeId: string, server: EdSnapshot | null): DraftBackup | null {
  if (!backup || backup.storeId !== storeId || !backup.snapshot?.pages) return null;
  if (server && draftVersion(server) !== backup.baseVersion) return null;
  if (sameSnapshot(backup.snapshot, server)) return null;
  return backup;
}

// ─── Pages and sections ──────────────────────────────────────────────────────

/** The announcement bar, header and footer: shared by every page, never moved, copied or deleted from the phone. */
export const CHROME_KINDS = ["announcement-bar", "header", "footer"] as const;
export const isChrome = (kind: string) => (CHROME_KINDS as readonly string[]).includes(kind);
export const isFooter = (kind: string) => kind === "footer";

/** Store pages that are templates for every product, the bag or checkout: not in the phone's page list. */
export const SYSTEM_PAGE_TYPES = ["product", "cart", "checkout", "wishlist", "categories"];

export function findPage(snapshot: EdSnapshot | null | undefined, pageKey: string): EdPage | null {
  return snapshot?.pages.find((page) => page.pageType === pageKey) ?? null;
}

export function findSection(snapshot: EdSnapshot | null | undefined, pageKey: string, sectionId: string | null | undefined): EdSection | null {
  if (!sectionId) return null;
  return findPage(snapshot, pageKey)?.sections.find((section) => section.id === sectionId) ?? null;
}

/**
 * Changes one page's sections. The header, announcement bar and footer are the same on every page: a change to one
 * page's copy of them goes to every page (the web's propagateChrome does the same on save).
 */
export function updateSections(snapshot: EdSnapshot, pageKey: string, updater: (sections: EdSection[]) => EdSection[]): EdSnapshot {
  const page = findPage(snapshot, pageKey);
  if (!page) return snapshot;
  const nextSections = updater(page.sections);
  if (nextSections === page.sections) return snapshot;
  const chrome = new Map(nextSections.filter((section) => isChrome(section.kind)).map((section) => [section.id, section] as const));
  return {
    ...snapshot,
    pages: snapshot.pages.map((entry) => {
      if (entry.pageType === pageKey) return { ...entry, sections: nextSections };
      let changed = false;
      const sections = entry.sections.map((section) => {
        const shared = chrome.get(section.id);
        if (!shared || shared === section) return section;
        changed = true;
        return shared;
      });
      return changed ? { ...entry, sections } : entry;
    }),
  };
}

export function updateSection(snapshot: EdSnapshot, pageKey: string, sectionId: string, updater: (section: EdSection) => EdSection): EdSnapshot {
  return updateSections(snapshot, pageKey, (sections) => {
    let changed = false;
    const next = sections.map((section) => {
      if (section.id !== sectionId) return section;
      changed = true;
      return updater(section);
    });
    return changed ? next : sections;
  });
}

/** The section's words (its first copy block). */
export function sectionCopy(section: EdSection | null | undefined): Record<string, unknown> {
  return section?.blocks.find((block) => block.type === "copy")?.content ?? {};
}

/** Sets one of a section's words, as the web builder's setSectionCopy does (a copy block is made when missing). */
export function setCopy(snapshot: EdSnapshot, pageKey: string, sectionId: string, key: string, value: string): EdSnapshot {
  return updateSection(snapshot, pageKey, sectionId, (section) => {
    if (!section.blocks.some((block) => block.type === "copy")) {
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
  });
}

export function setSetting(snapshot: EdSnapshot, pageKey: string, sectionId: string, changes: Record<string, unknown>): EdSnapshot {
  return updateSection(snapshot, pageKey, sectionId, (section) => ({ ...section, settings: { ...(section.settings ?? {}), ...changes } }));
}

export function toggleSection(snapshot: EdSnapshot, pageKey: string, sectionId: string, visible: boolean): EdSnapshot {
  return updateSection(snapshot, pageKey, sectionId, (section) => ({ ...section, visible }));
}

export function removeSection(snapshot: EdSnapshot, pageKey: string, sectionId: string): EdSnapshot {
  return updateSections(snapshot, pageKey, (sections) => {
    const target = sections.find((section) => section.id === sectionId);
    if (!target || isChrome(target.kind)) return sections;
    return sections.filter((section) => section.id !== sectionId);
  });
}

/** Indexes of the page's own sections (not the header, bar or footer), in order. */
export function bodyIndexes(sections: EdSection[]) {
  return sections.map((section, index) => (isChrome(section.kind) ? -1 : index)).filter((index) => index >= 0);
}

/** Moves a section one place up (-1) or down (+1) among the page's own sections. Unchanged at either end. */
export function moveSection(snapshot: EdSnapshot, pageKey: string, sectionId: string, direction: -1 | 1): EdSnapshot {
  return updateSections(snapshot, pageKey, (sections) => {
    const from = sections.findIndex((section) => section.id === sectionId);
    if (from < 0 || isChrome(sections[from]!.kind)) return sections;
    const body = bodyIndexes(sections);
    const at = body.indexOf(from);
    const to = body[at + direction];
    if (to === undefined) return sections;
    const next = [...sections];
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
  });
}

export function canMove(snapshot: EdSnapshot, pageKey: string, sectionId: string, direction: -1 | 1) {
  return moveSection(snapshot, pageKey, sectionId, direction) !== snapshot;
}

/** Drag to reorder (SE-09): puts the page's own section `sectionId` at body position `toBodyIndex`. */
export function moveSectionTo(snapshot: EdSnapshot, pageKey: string, sectionId: string, toBodyIndex: number): EdSnapshot {
  return updateSections(snapshot, pageKey, (sections) => {
    const body = bodyIndexes(sections);
    const bodySections = body.map((index) => sections[index]!);
    const from = bodySections.findIndex((section) => section.id === sectionId);
    if (from < 0) return sections;
    const to = Math.max(0, Math.min(bodySections.length - 1, toBodyIndex));
    if (from === to) return sections;
    const [moved] = bodySections.splice(from, 1);
    bodySections.splice(to, 0, moved!);
    const next = [...sections];
    body.forEach((slot, order) => {
      next[slot] = bodySections[order]!;
    });
    return next;
  });
}

/** A new section id: the kind, the time and a few random letters (never reused on the page). */
export function newSectionId(kind: string, now = Date.now(), random = Math.random()) {
  return `${kind}-${now.toString(36)}${Math.floor(random * 1296).toString(36).padStart(2, "0")}`;
}

/** A copy of a ready-made section (from the server's catalogue) with its own ids. */
export function withNewIds(template: EdSection, id: string): EdSection {
  const copy = clone(template);
  copy.id = id;
  copy.visible = true;
  copy.blocks = (copy.blocks ?? []).map((block, index) => ({ ...block, id: index === 0 ? `${id}-${block.type || "copy"}` : `${id}-${block.type || "block"}-${index}` }));
  return copy;
}

/**
 * Drops a section in (SE-07/SE-08): after `afterId`, before the first section when `afterId` is null and the page
 * has no header, else after the header. Never below the footer. Returns the new snapshot.
 */
export function insertSection(snapshot: EdSnapshot, pageKey: string, section: EdSection, afterId: string | null): EdSnapshot {
  return updateSections(snapshot, pageKey, (sections) => {
    const footer = sections.findIndex((entry) => isFooter(entry.kind));
    const end = footer < 0 ? sections.length : footer;
    let index: number;
    if (afterId) {
      const found = sections.findIndex((entry) => entry.id === afterId);
      index = found < 0 ? end : found + 1;
    } else {
      // The top of the page: under the announcement bar and header.
      let lastHead = -1;
      sections.forEach((entry, at) => {
        if (entry.kind === "header" || entry.kind === "announcement-bar") lastHead = at;
      });
      index = lastHead + 1;
    }
    index = Math.min(Math.max(0, index), end);
    const next = [...sections];
    next.splice(index, 0, section);
    return next;
  });
}

export function duplicateSection(snapshot: EdSnapshot, pageKey: string, sectionId: string, newId: string): EdSnapshot {
  const source = findSection(snapshot, pageKey, sectionId);
  if (!source || isChrome(source.kind)) return snapshot;
  return insertSection(snapshot, pageKey, withNewIds(source, newId), sectionId);
}

/** Where a new section goes by default: under the selected one, else at the end of the page body. */
export function defaultInsertAfter(snapshot: EdSnapshot, pageKey: string, selectedId: string | null): string | null {
  const sections = findPage(snapshot, pageKey)?.sections ?? [];
  const selected = sections.find((section) => section.id === selectedId);
  if (selected && !isFooter(selected.kind)) return selected.id;
  const footer = sections.findIndex((section) => isFooter(section.kind));
  const before = footer < 0 ? sections[sections.length - 1] : sections[footer - 1];
  return before?.id ?? null;
}

// ─── Photos ──────────────────────────────────────────────────────────────────

/** Ready-made blocks keep their picture in a copy field; the classic sections and banners in their first item. */
const COPY_PHOTO_KEYS: Record<string, string> = {
  "split-hero": "mediaUrl",
  "parallax-banner": "mediaUrl",
  "video-hero": "posterUrl",
  "shop-the-look": "imageUrl",
  "founder-story": "portraitUrl",
  "campaign-countdown-hero": "mediaUrl",
  "campaign-featured-deal": "imageUrl",
  "shoppable-story": "imageUrl",
};
const ITEM_PHOTO_KINDS = ["hero-split", "story-split", "about-section", "promo-banner", "page-header"];

export type PhotoSlot = { mode: "item"; index: number } | { mode: "copy"; key: string } | { mode: "block"; blockId: string };

export function photoSlot(section: EdSection | null | undefined): PhotoSlot | null {
  if (!section) return null;
  const key = COPY_PHOTO_KEYS[section.kind];
  if (key) return { mode: "copy", key };
  const image = section.blocks.find((block) => block.type === "image");
  if (image) return { mode: "block", blockId: image.id };
  if (ITEM_PHOTO_KINDS.includes(section.kind)) return { mode: "item", index: 0 };
  return null;
}

export function itemPhoto(item: Record<string, unknown> | null | undefined) {
  if (!item) return "";
  return str(item.imageUrl) || str(item.resolvedSrc) || str(item.originalSrc);
}

/** The section's picture now ("" when it has none yet: the theme's stock photo or a product photo shows). */
export function readPhoto(section: EdSection | null | undefined): string {
  const slot = photoSlot(section);
  if (!slot || !section) return "";
  if (slot.mode === "copy") return str(sectionCopy(section)[slot.key]);
  if (slot.mode === "block") {
    const block = section.blocks.find((entry) => entry.id === slot.blockId);
    return str(block?.content.resolvedSrc) || str(block?.content.originalSrc) || str(block?.content.src);
  }
  return itemPhoto(section.items?.[slot.index]);
}

/** Puts a picture in the section, stored the way the web builder's media field stores it. */
export function setPhoto(snapshot: EdSnapshot, pageKey: string, sectionId: string, url: string): EdSnapshot {
  const clean = url.trim();
  const section = findSection(snapshot, pageKey, sectionId);
  const slot = photoSlot(section);
  if (!section || !slot) return snapshot;
  if (slot.mode === "copy") return setCopy(snapshot, pageKey, sectionId, slot.key, clean);
  if (slot.mode === "block") {
    return updateSection(snapshot, pageKey, sectionId, (entry) => ({
      ...entry,
      blocks: entry.blocks.map((block) => (block.id === slot.blockId ? { ...block, content: { ...block.content, originalSrc: clean, resolvedSrc: clean } } : block)),
    }));
  }
  return updateSection(snapshot, pageKey, sectionId, (entry) => {
    const items = entry.items ?? [];
    const picture = { imageUrl: clean, originalSrc: clean, resolvedSrc: clean };
    const next = [...items];
    next[slot.index] = { ...(items[slot.index] ?? {}), ...picture };
    return { ...entry, items: next };
  });
}

/** Every picture already in the shop (sections first, then product photos), for "Recent photos" (SE-05). */
export function shopPhotos(snapshot: EdSnapshot | null | undefined, productImages: string[] = [], limit = 16): string[] {
  const out: string[] = [];
  const add = (url: string) => {
    if (/^https?:\/\//.test(url) && !out.includes(url)) out.push(url);
  };
  for (const page of snapshot?.pages ?? []) for (const section of page.sections) {
    add(readPhoto(section));
    for (const item of section.items ?? []) add(itemPhoto(item));
  }
  for (const url of productImages) add(url);
  return out.slice(0, limit);
}

/**
 * The crop for "drag to frame it" (SE-06): the part of a photo that shows in a frame of `frame` size when the photo
 * covers the frame, zoomed by `zoom` (1 = just covers) and moved by `offset` (frame pixels; 0,0 = centred). In the
 * photo's own pixels, kept inside the photo.
 */
export function coverCrop(photo: { width: number; height: number }, frame: { width: number; height: number }, zoom: number, offset: { x: number; y: number }) {
  const z = Math.max(1, zoom);
  const cover = Math.max(frame.width / photo.width, frame.height / photo.height) * z;
  const shownW = photo.width * cover;
  const shownH = photo.height * cover;
  const maxX = Math.max(0, (shownW - frame.width) / 2);
  const maxY = Math.max(0, (shownH - frame.height) / 2);
  const x = Math.max(-maxX, Math.min(maxX, offset.x));
  const y = Math.max(-maxY, Math.min(maxY, offset.y));
  // Top-left of the frame in shown pixels, then in photo pixels.
  const left = (shownW - frame.width) / 2 - x;
  const top = (shownH - frame.height) / 2 - y;
  const width = Math.min(photo.width, Math.round(frame.width / cover));
  const height = Math.min(photo.height, Math.round(frame.height / cover));
  return {
    originX: Math.max(0, Math.min(photo.width - width, Math.round(left / cover))),
    originY: Math.max(0, Math.min(photo.height - height, Math.round(top / cover))),
    width,
    height,
    offset: { x, y },
  };
}

// ─── Friendly names ──────────────────────────────────────────────────────────

const KIND_LABELS: Array<[string, string[]]> = [
  ["header", ["header"]],
  ["announcement", ["announcement-bar", "ticker-bar", "campaign-promo-strip"]],
  ["banner", ["hero-split", "split-hero", "parallax-banner", "page-header", "promo-banner"]],
  ["video", ["video-hero"]],
  ["products", ["featured-products", "product-carousel", "tabbed-products", "also-like", "recently-viewed", "campaign-deal-grid", "campaign-featured-deal", "campaign-gift-guide"]],
  ["collections", ["category-grid", "collection-grid", "category-list"]],
  ["reviews", ["testimonials", "review-carousel"]],
  ["delivery", ["trust-strip", "trust-badges", "delivery-info", "payment-info", "shipping-progress"]],
  ["countdown", ["payday-countdown", "campaign-countdown-hero"]],
  ["photoText", ["story-split", "founder-story", "about-section", "shoppable-story", "shop-the-look"]],
  ["text", ["text-columns", "text"]],
  ["faq", ["faq"]],
  ["newsletter", ["newsletter"]],
  ["contact", ["contact-form"]],
  ["instagram", ["ugc-grid"]],
  ["footer", ["footer"]],
];

/** The i18n key ("kind.banner") for a section's friendly name, or null when the section's own name is used. */
export function kindLabelKey(kind: string): string | null {
  const found = KIND_LABELS.find(([, kinds]) => kinds.includes(kind));
  return found ? `kind.${found[0]}` : null;
}

export const isProductsKind = (kind: string) => ["featured-products", "product-carousel"].includes(kind);

// ─── The "Add a section" catalogue (SE-07) ───────────────────────────────────

export type BlockGroup = "popular" | "sell" | "trust" | "media" | "contact";
export const BLOCK_GROUPS: BlockGroup[] = ["popular", "sell", "trust", "media", "contact"];

export interface EditorBlockDef {
  id: string;
  /** i18n key of its name in the sheet. */
  label: string;
  groups: BlockGroup[];
  /** The section kind it adds, per renderer (none: not offered on that kind of theme). */
  kinds: Partial<Record<Renderer, string>>;
  thumb: "banner" | "products" | "text" | "photoText" | "reviews" | "countdown" | "video" | "faq" | "whatsapp" | "delivery" | "instagram" | "newsletter";
}

export const EDITOR_BLOCKS: EditorBlockDef[] = [
  { id: "banner", label: "block.banner", groups: ["popular", "sell"], kinds: { boutique: "hero-split", classic: "hero-split" }, thumb: "banner" },
  { id: "products", label: "block.products", groups: ["popular", "sell"], kinds: { boutique: "featured-products", classic: "featured-products" }, thumb: "products" },
  { id: "text", label: "block.text", groups: ["popular"], kinds: { boutique: "page-header", classic: "text-columns" }, thumb: "text" },
  { id: "photoText", label: "block.photoText", groups: ["popular", "media"], kinds: { boutique: "story-split", classic: "story-split" }, thumb: "photoText" },
  { id: "reviews", label: "block.reviews", groups: ["popular", "trust"], kinds: { boutique: "testimonials", classic: "testimonials" }, thumb: "reviews" },
  { id: "countdown", label: "block.countdown", groups: ["popular", "sell"], kinds: { boutique: "payday-countdown", classic: "promo-banner" }, thumb: "countdown" },
  { id: "video", label: "block.video", groups: ["popular", "media"], kinds: { boutique: "video-hero" }, thumb: "video" },
  { id: "faq", label: "block.faq", groups: ["popular", "trust"], kinds: { boutique: "faq", classic: "faq" }, thumb: "faq" },
  { id: "whatsapp", label: "block.whatsapp", groups: ["popular", "contact"], kinds: { boutique: "contact-form", classic: "contact-form" }, thumb: "whatsapp" },
  { id: "delivery", label: "block.delivery", groups: ["popular", "trust"], kinds: { boutique: "trust-badges", classic: "delivery-info" }, thumb: "delivery" },
  { id: "instagram", label: "block.instagram", groups: ["popular", "media"], kinds: { boutique: "ugc-grid" }, thumb: "instagram" },
  { id: "newsletter", label: "block.newsletter", groups: ["popular", "contact"], kinds: { boutique: "newsletter", classic: "newsletter" }, thumb: "newsletter" },
];

/** The blocks a theme can take, in a group (the server sends their ready-made sections, keyed by block id). */
export function blocksFor(renderer: Renderer, group: BlockGroup = "popular") {
  return EDITOR_BLOCKS.filter((block) => block.kinds[renderer] && block.groups.includes(group));
}

// ─── Theme (SE-10) ───────────────────────────────────────────────────────────

export interface ThemePreset {
  id: "warm" | "teal" | "noir" | "rose";
  label: string;
  /** The three dots on the swatch. */
  swatch: [string, string, string];
  tokens: Record<string, string>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "warm",
    label: "theme.warm",
    swatch: ["#FF6A2B", "#FFF3EC", "#FFFFFF"],
    tokens: { accent: "#FF6A2B", ctaBg: "#FF6A2B", ctaText: "#16141F", paperBg: "#FFFFFF", cardBg: "#FFF3EC", ink: "#16141F", muted: "#6B6779", border: "#F1E4DB", heroBg: "#FFF3EC", heroText: "#16141F" },
  },
  {
    id: "teal",
    label: "theme.teal",
    swatch: ["#0C4A44", "#E2F6F1", "#F3FAF8"],
    tokens: { accent: "#0C4A44", ctaBg: "#0C4A44", ctaText: "#FFFFFF", paperBg: "#F3FAF8", cardBg: "#E2F6F1", ink: "#0C2E2A", muted: "#4C6763", border: "#D3E9E3", heroBg: "#E2F6F1", heroText: "#0C2E2A" },
  },
  {
    id: "noir",
    label: "theme.noir",
    swatch: ["#E2F5A0", "#26222F", "#16141F"],
    tokens: { accent: "#E2F5A0", ctaBg: "#E2F5A0", ctaText: "#16141F", paperBg: "#16141F", cardBg: "#26222F", ink: "#F5F4F8", muted: "#B8B4C4", border: "#34303F", heroBg: "#26222F", heroText: "#F5F4F8" },
  },
  {
    id: "rose",
    label: "theme.rose",
    swatch: ["#C2185B", "#FCE4EC", "#FFF7F9"],
    tokens: { accent: "#C2185B", ctaBg: "#C2185B", ctaText: "#FFFFFF", paperBg: "#FFF7F9", cardBg: "#FCE4EC", ink: "#2A1420", muted: "#7A5866", border: "#F2D4DE", heroBg: "#FCE4EC", heroText: "#2A1420" },
  },
];

const upper = (value: unknown) => str(value).toUpperCase();

export function themePresetOf(tokens: Record<string, unknown> | null | undefined): ThemePreset | null {
  if (!tokens) return null;
  return THEME_PRESETS.find((preset) => Object.entries(preset.tokens).every(([key, value]) => upper(tokens[key]) === value.toUpperCase())) ?? null;
}

export function applyThemePreset(snapshot: EdSnapshot, presetId: ThemePreset["id"]): EdSnapshot {
  const preset = THEME_PRESETS.find((entry) => entry.id === presetId);
  if (!preset) return snapshot;
  return { ...snapshot, themeTokens: { ...snapshot.themeTokens, ...preset.tokens } };
}

/** "Custom": one colour for the accent and the buttons, with text that reads on it. */
export const CUSTOM_ACCENTS = ["#16141F", "#C9744A", "#E86A4F", "#F2A93B", "#2E7E78", "#1F4FD8", "#6B4F8A", "#D6336C"] as const;

export function readableOn(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#FFFFFF";
  const value = parseInt(match[1]!, 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.36 ? "#16141F" : "#FFFFFF";
}

export function applyAccent(snapshot: EdSnapshot, hex: string): EdSnapshot {
  const color = hex.toUpperCase();
  return { ...snapshot, themeTokens: { ...snapshot.themeTokens, accent: color, ctaBg: color, ctaText: readableOn(color) } };
}

export type FontChoice = "bold" | "elegant" | "clean";
export const FONT_CHOICES: Array<{ id: FontChoice; label: string; tokens: Record<string, string> }> = [
  { id: "bold", label: "font.bold", tokens: { fontPair: "bold", headingStyle: "grotesk" } },
  { id: "elegant", label: "font.elegant", tokens: { fontPair: "classic", headingStyle: "serif" } },
  { id: "clean", label: "font.clean", tokens: { fontPair: "clean", headingStyle: "grotesk" } },
];

export function fontChoiceOf(tokens: Record<string, unknown> | null | undefined): FontChoice | null {
  const pair = str(tokens?.fontPair);
  if (pair === "bold") return "bold";
  if (pair === "classic") return "elegant";
  if (pair === "clean" || pair === "modern") return "clean";
  return null;
}

export type ButtonChoice = "round" | "soft" | "square";
export const BUTTON_CHOICES: Array<{ id: ButtonChoice; label: string; radius: number; tokens: Record<string, string> }> = [
  { id: "round", label: "buttons.round", radius: 99, tokens: { buttonShape: "pill", radius: "soft" } },
  { id: "soft", label: "buttons.soft", radius: 12, tokens: { buttonShape: "rounded", radius: "rounded" } },
  { id: "square", label: "buttons.square", radius: 4, tokens: { buttonShape: "square", radius: "sharp" } },
];

export function buttonChoiceOf(tokens: Record<string, unknown> | null | undefined): ButtonChoice | null {
  const shape = str(tokens?.buttonShape);
  if (shape === "pill") return "round";
  if (shape === "rounded") return "soft";
  if (shape === "square") return "square";
  return null;
}

export function applyTokens(snapshot: EdSnapshot, tokens: Record<string, string>): EdSnapshot {
  return { ...snapshot, themeTokens: { ...snapshot.themeTokens, ...tokens } };
}

// ─── Products section (SE-16) ────────────────────────────────────────────────

export type ProductsShow = { kind: "best-sellers" } | { kind: "new" } | { kind: "collection"; collectionId: string } | { kind: "picked" };
export type ProductsLayout = "one" | "two" | "three" | "slider";

/** On the 2026 themes a layout per choice; the classic themes show a grid (the choice sets products per row). */
export const PRODUCT_LAYOUTS: Record<ProductsLayout, { layout: string; columns: string }> = {
  one: { layout: "lookbook", columns: "2" },
  two: { layout: "tiles", columns: "2" },
  three: { layout: "dense", columns: "3" },
  slider: { layout: "carousel", columns: "4" },
};

export function productsShowOf(section: EdSection | null | undefined, renderer: Renderer): ProductsShow {
  const settings = section?.settings ?? {};
  const picked = (section?.items ?? []).some((item) => str(item.mappedStoreProductId));
  if (renderer === "classic") return picked ? { kind: "picked" } : { kind: "new" };
  const source = str(settings.source) || "best-sellers";
  if (source === "collection" && str(settings.collectionId)) return { kind: "collection", collectionId: str(settings.collectionId) };
  if (source === "picked") return { kind: "picked" };
  if (source === "new") return { kind: "new" };
  return { kind: "best-sellers" };
}

export function setProductsShow(snapshot: EdSnapshot, pageKey: string, sectionId: string, show: ProductsShow, renderer: Renderer, pickedIds: string[] = []): EdSnapshot {
  return updateSection(snapshot, pageKey, sectionId, (section) => {
    const items = show.kind === "picked" ? [...new Set(pickedIds)].map((id) => ({ mappedStoreProductId: id })) : renderer === "classic" ? [] : section.items ?? [];
    if (renderer === "classic") return { ...section, items };
    const settings: Record<string, unknown> = { ...(section.settings ?? {}), source: show.kind };
    if (show.kind === "collection") settings.collectionId = show.collectionId;
    return { ...section, items, settings };
  });
}

export function productsLayoutOf(section: EdSection | null | undefined, renderer: Renderer): ProductsLayout {
  const settings = section?.settings ?? {};
  if (renderer === "classic") {
    const columns = str(settings.columns) || "3";
    return columns === "2" ? "two" : columns === "4" ? "slider" : "three";
  }
  const layout = str(settings.layout) || "carousel";
  const found = (Object.entries(PRODUCT_LAYOUTS) as Array<[ProductsLayout, { layout: string }]>).find(([, entry]) => entry.layout === layout);
  return found ? found[0] : "slider";
}

export function setProductsLayout(snapshot: EdSnapshot, pageKey: string, sectionId: string, layout: ProductsLayout, renderer: Renderer): EdSnapshot {
  const entry = PRODUCT_LAYOUTS[layout];
  return setSetting(snapshot, pageKey, sectionId, renderer === "classic" ? { columns: entry.columns } : { layout: entry.layout });
}

export const pickedProductIds = (section: EdSection | null | undefined) => (section?.items ?? []).map((item) => str(item.mappedStoreProductId)).filter(Boolean);

// ─── Pages (SE-15) ───────────────────────────────────────────────────────────

export interface PageRow {
  key: string;
  title: string;
  pageType: string;
  sections: number;
  photo: string;
  custom: boolean;
}

const STANDARD_PAGE_TYPES = ["home", "products", "about", "contact", "faq", "blog"];

export function pageRows(snapshot: EdSnapshot | null | undefined): PageRow[] {
  return (snapshot?.pages ?? [])
    .filter((page) => !SYSTEM_PAGE_TYPES.includes(page.pageType))
    .map((page) => ({
      key: page.pageType,
      title: page.title,
      pageType: page.pageType,
      sections: page.sections.filter((section) => !isChrome(section.kind)).length,
      photo: page.sections.map(readPhoto).find(Boolean) ?? "",
      custom: !STANDARD_PAGE_TYPES.includes(page.pageType),
    }));
}

/** A new page (SE-15 "Blank page"): the shared header and footer around one text section. Returns its key. */
export function addPage(snapshot: EdSnapshot, title: string, body: EdSection, storeName: string): { snapshot: EdSnapshot; key: string } {
  const clean = title.trim() || "New page";
  const base = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
  const slug = customPageSlug(base, snapshot.pages.flatMap((page) => [page.pageType, page.slug ?? ""]));
  const home = snapshot.pages.find((page) => page.pageType === "home") ?? snapshot.pages[0];
  const chrome = (home?.sections ?? []).filter((section) => isChrome(section.kind));
  const head = chrome.filter((section) => !isFooter(section.kind));
  const foot = chrome.filter((section) => isFooter(section.kind));
  const section = { ...withNewIds(body, newSectionId("text")), name: clean };
  section.blocks = section.blocks.length
    ? section.blocks.map((block, index) => (index === 0 && block.type === "copy" ? { ...block, content: { ...block.content, title: clean } } : block))
    : [{ id: `${section.id}-copy`, type: "copy", content: { title: clean, body: "" } }];
  const page: EdPage = { id: `custom-${slug}`, pageType: slug, title: clean, slug, sections: [...head, section, ...foot], seo: { metaTitle: `${clean} | ${storeName}`.slice(0, 70), metaDescription: "" } };
  return { snapshot: { ...snapshot, pages: [...snapshot.pages, page] }, key: slug };
}

// ─── What changed (SE-13) ────────────────────────────────────────────────────

export type ChangeKind = "photo" | "headline" | "text" | "added" | "removed" | "hidden" | "shown" | "moved" | "theme" | "products" | "settings" | "pageAdded" | "pageRemoved";

export interface ChangeItem {
  kind: ChangeKind;
  /** The section's kind (for its friendly name) and own name. */
  sectionKind?: string;
  sectionName?: string;
  /** The page it's on ("" for theme changes, which are everywhere). */
  page: string;
  pageTitle: string;
  /** For theme changes: the preset's id when it matches one. */
  preset?: string;
}

const HEADLINE_KEYS = ["title", "heading", "headline"];

function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null));
}

/** One section, before and after: its own changes (a new photo, a new headline, other words, its settings). */
function sectionChanges(before: EdSection, after: EdSection, page: EdPage): ChangeItem[] {
  const base = { sectionKind: after.kind, sectionName: after.name, page: page.pageType, pageTitle: page.title };
  const out: ChangeItem[] = [];
  if ((before.visible !== false) !== (after.visible !== false)) out.push({ kind: after.visible === false ? "hidden" : "shown", ...base });
  const photoBefore = readPhoto(before);
  const photoAfter = readPhoto(after);
  if (photoBefore !== photoAfter) out.push({ kind: "photo", ...base });
  const photoKey = photoSlot(after)?.mode === "copy" ? (photoSlot(after) as { key: string }).key : null;
  const words = changedKeys(sectionCopy(before), sectionCopy(after)).filter((key) => key !== photoKey);
  if (words.some((key) => HEADLINE_KEYS.includes(key))) out.push({ kind: "headline", ...base });
  else if (words.length) out.push({ kind: "text", ...base });
  const stripPhotos = (items: Array<Record<string, unknown>> | undefined) => (items ?? []).map((item) => {
    const { imageUrl: _a, originalSrc: _b, resolvedSrc: _c, ...rest } = item;
    return rest;
  });
  const itemsChanged = JSON.stringify(stripPhotos(before.items)) !== JSON.stringify(stripPhotos(after.items));
  const otherBlocks = (section: EdSection) => section.blocks.filter((block) => block.type !== "copy");
  const settingsChanged = JSON.stringify(before.settings ?? {}) !== JSON.stringify(after.settings ?? {})
    || JSON.stringify(before.styles ?? {}) !== JSON.stringify(after.styles ?? {})
    || JSON.stringify(before.background ?? {}) !== JSON.stringify(after.background ?? {})
    || (photoSlot(after)?.mode !== "block" && JSON.stringify(otherBlocks(before)) !== JSON.stringify(otherBlocks(after)));
  if (itemsChanged || settingsChanged) out.push({ kind: isProductsKind(after.kind) ? "products" : "settings", ...base });
  return out;
}

/**
 * The changes between what shoppers see (published) and the draft, in plain terms: one row per change, the shared
 * header and footer counted once. Empty when nothing changed (or nothing was ever published: everything is new).
 */
export function summariseChanges(published: EdSnapshot | null | undefined, draft: EdSnapshot | null | undefined): ChangeItem[] {
  if (!published || !draft) return [];
  const out: ChangeItem[] = [];
  const seenChrome = new Set<string>();
  const tokensBefore = published.themeTokens ?? {};
  const tokensAfter = draft.themeTokens ?? {};
  if (changedKeys(tokensBefore, tokensAfter).length) {
    out.push({ kind: "theme", page: "", pageTitle: "", preset: themePresetOf(tokensAfter)?.id });
  }
  for (const page of draft.pages) {
    const old = published.pages.find((entry) => entry.pageType === page.pageType);
    if (!old) {
      if (!SYSTEM_PAGE_TYPES.includes(page.pageType)) out.push({ kind: "pageAdded", page: page.pageType, pageTitle: page.title });
      continue;
    }
    const oldById = new Map(old.sections.map((section) => [section.id, section] as const));
    const newIds = new Set(page.sections.map((section) => section.id));
    for (const section of page.sections) {
      if (isChrome(section.kind)) {
        if (seenChrome.has(section.id)) continue;
        seenChrome.add(section.id);
      }
      const before = oldById.get(section.id);
      if (!before) out.push({ kind: "added", sectionKind: section.kind, sectionName: section.name, page: page.pageType, pageTitle: page.title });
      else out.push(...sectionChanges(before, section, page));
    }
    for (const section of old.sections) {
      if (newIds.has(section.id)) continue;
      if (isChrome(section.kind)) {
        if (seenChrome.has(`removed:${section.id}`)) continue;
        seenChrome.add(`removed:${section.id}`);
      }
      out.push({ kind: "removed", sectionKind: section.kind, sectionName: section.name, page: page.pageType, pageTitle: page.title });
    }
    const common = (sections: EdSection[]) => sections.map((section) => section.id).filter((id) => newIds.has(id) && oldById.has(id));
    if (JSON.stringify(common(old.sections)) !== JSON.stringify(common(page.sections))) out.push({ kind: "moved", page: page.pageType, pageTitle: page.title });
  }
  for (const page of published.pages) {
    if (!draft.pages.some((entry) => entry.pageType === page.pageType) && !SYSTEM_PAGE_TYPES.includes(page.pageType)) out.push({ kind: "pageRemoved", page: page.pageType, pageTitle: page.title });
  }
  return out;
}

/** The i18n key of a change row's words (SE-13). */
export function changeLabelKey(kind: ChangeKind, preset?: string): string {
  if (kind === "theme") return preset ? "change.themePreset" : "change.theme";
  return `change.${kind}`;
}

/** The tone and icon of a change row's tile (SE-13): photo orange, words lilac, added butter, theme mint. */
export function changeTone(kind: ChangeKind): { tone: "peach" | "lilac" | "butter" | "mint" | "gray"; icon: "image" | "type" | "plus" | "palette" | "layers" | "eyeOff" | "x" | "doc" } {
  switch (kind) {
    case "photo":
      return { tone: "peach", icon: "image" };
    case "headline":
    case "text":
      return { tone: "lilac", icon: "type" };
    case "added":
    case "pageAdded":
      return { tone: "butter", icon: "plus" };
    case "theme":
      return { tone: "mint", icon: "palette" };
    case "hidden":
    case "shown":
      return { tone: "gray", icon: "eyeOff" };
    case "removed":
    case "pageRemoved":
      return { tone: "gray", icon: "x" };
    case "products":
      return { tone: "peach", icon: "layers" };
    default:
      return { tone: "gray", icon: "layers" };
  }
}

// ─── The canvas (src/app/store-canvas) and the phone talk in messages ────────

export const CANVAS_PATH = "/store-canvas";

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Phone → canvas (injected as window.__sibCanvas(message)). */
export type CanvasInbound =
  | { t: "init"; store: unknown; snapshot: EdSnapshot; page: string; mode: "edit" | "preview"; device: "mobile" | "desktop"; labels: Record<string, string>; words: CanvasWords }
  | { t: "snapshot"; snapshot: EdSnapshot; labels: Record<string, string> }
  | { t: "page"; page: string }
  | { t: "mode"; mode: "edit" | "preview"; device: "mobile" | "desktop" }
  | { t: "select"; id: string | null; scroll?: boolean; tag?: string | null }
  | { t: "marks"; marks: Array<{ id: string; tag: string }> }
  | { t: "editText"; id: string; part: "text" | "button" }
  | { t: "blur" };

/** The few words the canvas draws itself (the "+" buttons' labels), in the seller's language. */
export interface CanvasWords {
  addAbove: string;
  addBelow: string;
}

/** Canvas → phone (window.ReactNativeWebView.postMessage). Rects are in the WebView's own points. */
export type CanvasOutbound =
  | { t: "ready" }
  | { t: "select"; id: string; rect: CanvasRect | null; photo: CanvasRect | null; viewport: { width: number; height: number } }
  | { t: "rect"; rect: CanvasRect | null; photo: CanvasRect | null; moving: boolean }
  | { t: "deselect" }
  | { t: "copy"; id: string; key: string; value: string }
  | { t: "editing"; on: boolean }
  | { t: "add"; afterId: string | null }
  | { t: "navigate"; page: string };

export function parseCanvasMessage(raw: unknown): CanvasOutbound | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as { t?: unknown };
    return value && typeof value === "object" && typeof value.t === "string" ? (value as CanvasOutbound) : null;
  } catch {
    return null;
  }
}

/** The script the phone injects to hand a message to the canvas (queued by the page until it's ready). */
export function canvasScript(message: CanvasInbound) {
  return `(function(){var m=${JSON.stringify(message).replace(/</g, "\\u003c").replace(/ /g, "\\u2028").replace(/ /g, "\\u2029")};if(window.__sibCanvas){window.__sibCanvas(m);}else{(window.__sibCanvasQueue=window.__sibCanvasQueue||[]).push(m);}})();true;`;
}

/** The store's address without https:// and the trailing slash ("adashair.mybos.store"). */
export function shownHost(url: string | null | undefined) {
  return (url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}
