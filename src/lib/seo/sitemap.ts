// A store's sitemap.xml: which addresses go in it (home, its pages, every published product with its photos,
// product collections, CMS collections and their items such as blog posts, policies) and the XML itself, split into a
// sitemap index when a store outgrows one file. Pure (relative .ts imports only) so tests/storefront-seo.test.mjs
// loads it directly; src/app/s/[slug]/sitemap.xml/route.ts gathers the data.

import { findStorefrontPage, normalizeStorefrontPageKey, STOREFRONT_PAGE_PATHS, storefrontPagePath } from "../../../shared/storefront-pages.ts";

export interface SitemapImage {
  loc: string;
  title?: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string | Date | null;
  images?: SitemapImage[];
}

/** The protocol's limit per file is 50,000 URLs; Google reads up to 1,000 images per URL. */
export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_IMAGES = 1_000;

export function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** W3C date (YYYY-MM-DD…) for <lastmod>, or null for anything that isn't a real date. */
export function w3cDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Only absolute http(s) links (uploaded photos); data: URIs and relative paths never go in a sitemap. */
export function absoluteHttpUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sitemapXml(entries: readonly SitemapEntry[]) {
  const withImages = entries.some((entry) => entry.images?.length);
  const rows = entries.map((entry) => {
    const lastmod = w3cDate(entry.lastmod);
    const images = (entry.images ?? []).slice(0, SITEMAP_MAX_IMAGES).map((image) => `<image:image><image:loc>${xmlEscape(image.loc)}</image:loc></image:image>`);
    return `<url><loc>${xmlEscape(entry.loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${images.join("")}</url>`;
  });
  const ns = `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${withImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ""}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${ns}>\n${rows.join("\n")}${rows.length ? "\n" : ""}</urlset>\n`;
}

export function sitemapIndexXml(sitemaps: ReadonlyArray<{ loc: string; lastmod?: string | Date | null }>) {
  const rows = sitemaps.map((entry) => {
    const lastmod = w3cDate(entry.lastmod);
    return `<sitemap><loc>${xmlEscape(entry.loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</sitemap>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}${rows.length ? "\n" : ""}</sitemapindex>\n`;
}

/**
 * What /sitemap.xml answers: one urlset when the store fits in a file, else an index of /sitemap.xml?part=N files.
 * `part` (1-based) picks one file of a split sitemap; out of range is null (the route's 404).
 */
export function renderStoreSitemap(entries: readonly SitemapEntry[], sitemapUrl: string, part: number | null, max = SITEMAP_MAX_URLS): string | null {
  const parts = Math.max(1, Math.ceil(entries.length / max));
  if (part === null) {
    if (parts === 1) return sitemapXml(entries);
    const newest = (slice: readonly SitemapEntry[]) => slice.map((entry) => w3cDate(entry.lastmod)).filter((value): value is string => Boolean(value)).sort().pop() ?? null;
    return sitemapIndexXml(Array.from({ length: parts }, (_, index) => ({ loc: `${sitemapUrl}?part=${index + 1}`, lastmod: newest(entries.slice(index * max, (index + 1) * max)) })));
  }
  if (!Number.isInteger(part) || part < 1 || part > parts) return null;
  return sitemapXml(entries.slice((part - 1) * max, part * max));
}

// ─── Which pages of a store have an address worth listing ──────────────────────

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Pages with an address that are shopper flows, not content (and the blog, listed through its CMS collection). */
const NOT_LISTED = new Set(["wishlist", "checkout", "cart", "product", "blog"]);

export interface StorefrontPageRef {
  key: string;
  path: string;
  title: string;
  noIndex: boolean;
}

/**
 * The store's own pages with an address (/shop, /about, /contact, /faq, custom pages…), from its published builder
 * snapshot and its published page rows: the same two sources the storefront renders from. Home and the shop are
 * always there. Pages whose SEO tab says "hide from search engines" are flagged.
 */
export function storefrontPageRefs(store: { pages?: unknown; brandSettings?: unknown }): StorefrontPageRef[] {
  const snapshotPages = rec(rec(rec(store.brandSettings).editor).published).pages;
  const rows = Array.isArray(store.pages) ? store.pages.map(rec) : [];
  // Standard pages are keyed by their type (about, faq…); anything else (a custom page) by its slug.
  const keyOf = (pageType: unknown, slug: unknown) => (typeof pageType === "string" && STOREFRONT_PAGE_PATHS[pageType] ? pageType : slug);
  const fromSnapshot = Array.isArray(snapshotPages) ? snapshotPages.map(rec).map((page) => ({ key: keyOf(page.pageType, page.slug), title: page.title, seo: page.seo })) : [];
  const fromRows = rows.map((row) => {
    const content = rec(row.publishedContent ?? row.content);
    const pageType = content.pageType ?? row.type;
    return { key: keyOf(pageType, row.slug), title: content.title ?? row.title, seo: content.seo, slug: String(row.slug ?? ""), pageType: String(pageType ?? "") };
  });
  // The storefront answers a page from either source (shared/storefront-pages.ts storeHasStorefrontPage).
  const source = [...fromSnapshot, ...fromRows];
  const out = new Map<string, StorefrontPageRef>();
  const add = (rawKey: unknown, title: unknown, seo: unknown) => {
    const key = normalizeStorefrontPageKey(rawKey);
    if (!key || NOT_LISTED.has(key) || out.has(key)) return;
    const path = storefrontPagePath(key);
    if (!path) return;
    // A row-level SEO tab can override the snapshot's (src/lib/seo/page-seo.ts reads them the same way).
    const row = findStorefrontPage(fromRows, key);
    const noIndex = rec(seo).noIndex === true || rec(row?.seo).noIndex === true;
    out.set(key, { key, path, title: typeof title === "string" && title.trim() ? title.trim() : key, noIndex });
  };
  add("home", "Home", null);
  for (const page of source) add(page.key, page.title, page.seo);
  if (!out.has("products")) add("products", "Shop", null);
  return [...out.values()];
}

// ─── The entries ─────────────────────────────────────────────────────────────

export interface StoreSitemapInput {
  /** Absolute URL of a storefront path ("/about" → "https://adas.ng/about"). */
  url: (path: string) => string;
  pages: ReadonlyArray<{ path: string; noIndex?: boolean; lastmod?: string | Date | null }>;
  products: ReadonlyArray<{ id: string; name?: string; images?: readonly string[]; updatedAt?: string | Date | null; noIndex?: boolean }>;
  /** Product collections (/collections/<slug>). */
  collections?: ReadonlyArray<{ slug: string; imageUrl?: string | null; updatedAt?: string | Date | null; noIndex?: boolean }>;
  /** Published CMS collections (/<slug>, e.g. /blog) and their live items (/<slug>/<item>). */
  cms?: ReadonlyArray<{ slug: string; updatedAt?: string | Date | null; items: ReadonlyArray<{ slug: string; image?: string | null; updatedAt?: string | Date | null; noIndex?: boolean }>; noIndex?: boolean }>;
  /** Other paths worth listing (published policies, the reviews page). */
  extraPaths?: ReadonlyArray<{ path: string; lastmod?: string | Date | null }>;
  /** When the store itself last changed (home and pages without their own date). */
  storeUpdatedAt?: string | Date | null;
}

const images = (list: ReadonlyArray<string | null | undefined> | undefined) =>
  (list ?? []).map(absoluteHttpUrl).filter((loc): loc is string => Boolean(loc)).filter((loc, index, all) => all.indexOf(loc) === index).map((loc) => ({ loc }));

/** Every address of a live store worth indexing, absolute, each once, home first. */
export function storeSitemapEntries(input: StoreSitemapInput): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  const push = (entry: SitemapEntry) => {
    if (seen.has(entry.loc)) return;
    seen.add(entry.loc);
    out.push(entry);
  };
  const pages = [...input.pages].sort((a, b) => (a.path === "/" ? -1 : b.path === "/" ? 1 : 0));
  for (const page of pages) if (!page.noIndex) push({ loc: input.url(page.path), lastmod: page.lastmod ?? input.storeUpdatedAt ?? null });
  for (const collection of input.collections ?? []) {
    if (!collection.noIndex) push({ loc: input.url(`/collections/${encodeURIComponent(collection.slug)}`), lastmod: collection.updatedAt ?? null, images: images([collection.imageUrl]) });
  }
  for (const product of input.products) {
    if (!product.noIndex) push({ loc: input.url(`/product/${encodeURIComponent(product.id)}`), lastmod: product.updatedAt ?? null, images: images(product.images) });
  }
  for (const collection of input.cms ?? []) {
    if (collection.noIndex) continue;
    push({ loc: input.url(`/${encodeURIComponent(collection.slug)}`), lastmod: collection.updatedAt ?? null });
    for (const item of collection.items) {
      if (!item.noIndex) push({ loc: input.url(`/${encodeURIComponent(collection.slug)}/${encodeURIComponent(item.slug)}`), lastmod: item.updatedAt ?? null, images: images([item.image]) });
    }
  }
  for (const extra of input.extraPaths ?? []) push({ loc: input.url(extra.path), lastmod: extra.lastmod ?? null });
  return out;
}
