// What a live storefront page actually shows, read from the same published sources the storefront renders (the
// builder snapshot, else the published page rows): its sections and the FAQ questions shoppers can read there. The
// structured data and llms.txt only describe what is visible. Pure (relative .ts imports only), tested in
// tests/storefront-seo.test.mjs.

import { faqAnswer } from "../../components/storefront/boutique/faq/faq-logic.ts";
import type { StorefrontShopperInfo } from "../storefront/shopper-info.ts";
import { findStorefrontPage, normalizeStorefrontPageKey, STOREFRONT_PAGE_PATHS } from "../../../shared/storefront-pages.ts";

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export interface ContentSection {
  kind: string;
  visible: boolean;
  items: Array<Record<string, unknown>>;
  copy: Record<string, unknown>;
}

export interface ContentPage {
  pageType: string;
  slug: string;
  title: string;
  sections: ContentSection[];
}

function readSections(raw: unknown): ContentSection[] {
  return (Array.isArray(raw) ? raw : []).map(rec).map((section) => {
    const blocks = Array.isArray(section.blocks) ? section.blocks.map(rec) : [];
    return {
      kind: String(section.kind ?? ""),
      visible: section.visible !== false,
      items: Array.isArray(section.items) ? section.items.map(rec) : [],
      copy: rec(blocks.find((block) => block.type === "copy")?.content),
    };
  });
}

/** The published pages of a store with their sections (snapshot first, like StorefrontClient). */
export function storefrontContentPages(store: { pages?: unknown; brandSettings?: unknown }): ContentPage[] {
  const published = rec(rec(rec(store.brandSettings).editor).published);
  if (Array.isArray(published.pages) && published.pages.length) {
    return published.pages.map(rec).map((page) => ({ pageType: String(page.pageType ?? ""), slug: String(page.slug ?? ""), title: String(page.title ?? ""), sections: readSections(page.sections) }));
  }
  const rows = Array.isArray(store.pages) ? store.pages.map(rec) : [];
  return rows.map((row) => {
    const content = rec(row.publishedContent ?? row.content);
    return { pageType: String(content.pageType ?? row.type ?? ""), slug: row.slug === "home" ? "" : String(row.slug ?? ""), title: String(content.title ?? row.title ?? ""), sections: readSections(content.sections) };
  });
}

/** The page a key opens ("about", "products", a custom page's slug). */
export function storefrontContentPage(store: { pages?: unknown; brandSettings?: unknown }, key: string): ContentPage | null {
  const normalized = normalizeStorefrontPageKey(key);
  if (!normalized) return null;
  const pages = storefrontContentPages(store);
  // A standard key matches by type; a custom page by slug (never an about page that happens to share it).
  if (!STOREFRONT_PAGE_PATHS[normalized]) return pages.find((page) => normalizeStorefrontPageKey(page.slug) === normalized) ?? null;
  return findStorefrontPage(pages, normalized) ?? null;
}

/** Questions with answers in the visible FAQ sections of a page; blank answers filled from settings as the page does. */
export function pageFaqs(page: ContentPage | null, shopper: StorefrontShopperInfo | null, currency: string) {
  if (!page) return [];
  return page.sections
    .filter((section) => section.kind === "faq" && section.visible)
    .flatMap((section) => section.items)
    .map((item) => ({ question: typeof item.question === "string" ? item.question.trim() : "", answer: shopper ? faqAnswer(item, shopper, currency) : typeof item.answer === "string" ? item.answer.trim() : "" }))
    .filter((qa) => qa.question && qa.answer);
}

/** Every answered FAQ across the store's pages (the FAQ page first), each question once. */
export function storeFaqs(store: { pages?: unknown; brandSettings?: unknown }, shopper: StorefrontShopperInfo | null, currency: string) {
  const pages = storefrontContentPages(store);
  const ordered = [...pages.filter((page) => page.pageType === "faq"), ...pages.filter((page) => page.pageType !== "faq")];
  const seen = new Set<string>();
  return ordered.flatMap((page) => pageFaqs(page, shopper, currency)).filter((qa) => !seen.has(qa.question.toLowerCase()) && Boolean(seen.add(qa.question.toLowerCase())));
}

/** schema.org page type for a storefront page key. */
export function pageSchemaType(key: string): "AboutPage" | "ContactPage" | "CollectionPage" | "FAQPage" | "WebPage" {
  if (key === "about") return "AboutPage";
  if (key === "contact") return "ContactPage";
  if (key === "products" || key === "categories") return "CollectionPage";
  if (key === "faq") return "FAQPage";
  return "WebPage";
}
