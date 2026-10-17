// The store's chrome (announcement bar, header, footer) is the same on every page. Snapshots keep a copy of it on
// each page (renderers, Rex and older code read page.sections), and these helpers keep those copies identical:
// - propagateChrome(prev, next): after an edit, the page whose chrome changed hands its chrome to every page, so
//   editing the header or footer on any page edits it everywhere (the builder's commit and Rex's ops use it);
// - normalizeChrome(snapshot): older saves could hold different copies per page; the home page's copy wins (it is
//   also what the boutique product page and page frame always showed). Renderers apply it when they read a
//   snapshot, so a published store shows one header and footer even before the seller publishes again.
// Pure data helpers with type-only imports, so tests load this file without a bundler.

import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode } from "./types";

export const CHROME_KINDS = ["announcement-bar", "header", "footer"];
const TOP_KINDS = ["announcement-bar", "header"];

export function isChromeKind(kind: unknown) {
  return typeof kind === "string" && CHROME_KINDS.includes(kind);
}

function isTop(section: TemplateSectionNode) {
  return TOP_KINDS.includes(section.kind);
}

/** The chrome sections of a page, in page order. */
export function pageChrome(page: TemplatePageSeed | null | undefined): TemplateSectionNode[] {
  return Array.isArray(page?.sections) ? page.sections.filter((section) => section && isChromeKind(section.kind)) : [];
}

function chromeKey(sections: TemplateSectionNode[]) {
  return JSON.stringify(sections);
}

/**
 * The page with its chrome replaced by `chrome`: the announcement bar and header where the page had its own (the
 * top when it had none), the footer where its footer was (the end when it had none). Returns the same page when
 * its chrome already matches.
 */
export function applyChrome(page: TemplatePageSeed, chrome: TemplateSectionNode[]): TemplatePageSeed {
  if (!Array.isArray(page.sections)) return page;
  if (chromeKey(pageChrome(page)) === chromeKey(chrome)) return page;
  const body: TemplateSectionNode[] = [];
  let topAt = -1;
  let bottomAt = -1;
  for (const section of page.sections) {
    if (section && isChromeKind(section.kind)) {
      if (isTop(section)) { if (topAt === -1) topAt = body.length; }
      else if (bottomAt === -1) bottomAt = body.length;
    } else {
      body.push(section);
    }
  }
  const top = chrome.filter(isTop);
  const bottom = chrome.filter((section) => !isTop(section));
  const topIndex = topAt === -1 ? 0 : topAt;
  const bottomIndex = Math.max(topIndex, bottomAt === -1 ? body.length : bottomAt);
  return {
    ...page,
    sections: [...body.slice(0, topIndex), ...top, ...body.slice(topIndex, bottomIndex), ...bottom, ...body.slice(bottomIndex)],
  };
}

function withPages<T extends StoreEditorSnapshot>(snapshot: T, pages: TemplatePageSeed[]): T {
  return pages.some((page, index) => page !== snapshot.pages[index]) ? { ...snapshot, pages } : snapshot;
}

/**
 * The chrome every page should carry: the source page's (home by default, else the first page). A kind the
 * source page lacks but another page has (older saves only) is taken from the first page that has it.
 */
export function sharedChrome(snapshot: StoreEditorSnapshot, sourcePageType = "home"): TemplateSectionNode[] {
  const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];
  const source = pages.find((page) => page.pageType === sourcePageType) ?? pages[0];
  const chrome = pageChrome(source);
  const missing = CHROME_KINDS.filter((kind) => !chrome.some((section) => section.kind === kind));
  if (!missing.length) return chrome;
  const adopted: TemplateSectionNode[] = [];
  for (const kind of missing) {
    const donor = pages.find((page) => pageChrome(page).some((section) => section.kind === kind));
    if (donor) adopted.push(...pageChrome(donor).filter((section) => section.kind === kind));
  }
  if (!adopted.length) return chrome;
  // Announcement bars go above the header; a header or footer joins the end of its group.
  const announcement = adopted.filter((section) => section.kind === "announcement-bar");
  const rest = adopted.filter((section) => section.kind !== "announcement-bar");
  return [...announcement, ...chrome.filter(isTop), ...rest.filter(isTop), ...chrome.filter((section) => !isTop(section)), ...rest.filter((section) => !isTop(section))];
}

/** Every page gets the same chrome (the home page's). Returns the same snapshot when nothing changes. */
export function normalizeChrome<T extends StoreEditorSnapshot | null | undefined>(snapshot: T, sourcePageType = "home"): T {
  if (!snapshot || !Array.isArray(snapshot.pages) || snapshot.pages.length < 2) return snapshot;
  const chrome = sharedChrome(snapshot, sourcePageType);
  return withPages(snapshot, snapshot.pages.map((page) => applyChrome(page, chrome))) as T;
}

/**
 * After an edit (`prev` → `next`): when a page's chrome changed, every other page takes that page's chrome, so a
 * header or footer edit, a hidden announcement bar or a removed footer applies to the whole store. When several
 * pages changed differently (rare: a scripted edit), the home page's version wins. Returns `next` unchanged when no
 * chrome changed.
 */
export function propagateChrome(prev: StoreEditorSnapshot | null | undefined, next: StoreEditorSnapshot): StoreEditorSnapshot {
  if (!prev || !Array.isArray(prev.pages) || !Array.isArray(next.pages) || next.pages.length < 2) return next;
  const before = new Map(prev.pages.map((page) => [page.pageType, chromeKey(pageChrome(page))]));
  const changed = next.pages.filter((page) => before.has(page.pageType) && before.get(page.pageType) !== chromeKey(pageChrome(page)));
  if (!changed.length) return next;
  const source = changed.find((page) => page.pageType === "home") ?? changed[0]!;
  const chrome = pageChrome(source);
  return withPages(next, next.pages.map((page) => (page === source ? page : applyChrome(page, chrome))));
}

/**
 * Header "Shop name" (logoText) values still equal to the store's old name, emptied so the header follows the store
 * name again after a rename. Works on any JSON (a snapshot, a StorePage content). Returns null when nothing changed.
 */
export function clearStaleLogoText<T>(value: T, oldName: string): T | null {
  const old = oldName.trim();
  if (!old) return null;
  let changed = false;
  const walk = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(walk);
    if (!entry || typeof entry !== "object") return entry;
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(entry as Record<string, unknown>)) {
      if (key === "logoText" && typeof inner === "string" && inner.trim() === old) {
        out[key] = "";
        changed = true;
      } else {
        out[key] = walk(inner);
      }
    }
    return out;
  };
  const result = walk(value);
  return changed ? (result as T) : null;
}
