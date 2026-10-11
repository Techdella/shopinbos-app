import { normalizeSeo, type SeoFields } from "./fields.ts";

// SEO of a store page (About, Contact, a custom page) as the storefront serves it: the published page row
// (StorePage.content.seo, written by the Pages screen) or, failing that, the published builder snapshot.

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export function storePageSeo(store: { pages?: unknown; brandSettings?: unknown }, pageKey: string): { title: string; seo: SeoFields; slug: string } | null {
  if (!pageKey || pageKey === "home") return null;
  const pages = Array.isArray(store.pages) ? (store.pages as Array<Record<string, unknown>>) : [];
  const row = pages.find((page) => page.slug === pageKey || page.type === pageKey);
  const rowSeo = row ? rec(rec(row.content).seo) : {};
  const editor = rec(rec(store.brandSettings).editor);
  const published = rec(editor.published);
  const snapshotPages = Array.isArray(published.pages) ? (published.pages as Array<Record<string, unknown>>) : [];
  const fromSnapshot = snapshotPages.find((page) => page.slug === pageKey || page.pageType === pageKey);
  if (!row && !fromSnapshot) return null;
  const seo = normalizeSeo({ ...rec(fromSnapshot?.seo), ...Object.fromEntries(Object.entries(rowSeo).filter(([, value]) => value !== "" && value !== null && value !== undefined)) });
  return { title: String(row?.title ?? fromSnapshot?.title ?? pageKey), seo, slug: String(row?.slug ?? fromSnapshot?.slug ?? pageKey) };
}
