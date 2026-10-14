import type { Metadata } from "next";

// What every page of a store sets in the browser tab and in link previews, from Settings → SEO: its own favicon
// (else its logo) instead of the Shopinbos icon, and "<page> | <store>" titles instead of "| Shopinbos".
// Pages that set an absolute title (the home page, previews) keep it.

const HTTPS_IMAGE = /^https:\/\/\S+$/i;

export function storeFaviconUrl(brand: { logoUrl?: string | null; brandSettings?: Record<string, unknown> | null }) {
  const seo = brand.brandSettings?.seo;
  const favicon = seo && typeof seo === "object" ? (seo as Record<string, unknown>).favicon : null;
  if (typeof favicon === "string" && HTTPS_IMAGE.test(favicon.trim())) return favicon.trim();
  if (brand.logoUrl && HTTPS_IMAGE.test(brand.logoUrl)) return brand.logoUrl;
  return null;
}

export function storeHeadMetadata(brand: { name: string; logoUrl?: string | null; brandSettings?: Record<string, unknown> | null } | null): Metadata {
  if (!brand) return {};
  const icon = storeFaviconUrl(brand);
  return {
    title: { default: brand.name, template: `%s | ${brand.name}` },
    // An empty list hides the Shopinbos icon when the store has neither a favicon nor a logo.
    icons: icon ? { icon: [{ url: icon }], apple: [{ url: icon }] } : { icon: [], apple: [] },
    applicationName: brand.name,
    openGraph: { siteName: brand.name },
  };
}

/** Settings → SEO for the store's home page: title, description, keywords and link-preview picture. */
export function storeSeoSettings(brandSettings: Record<string, unknown> | null | undefined) {
  const seo = brandSettings?.seo && typeof brandSettings.seo === "object" ? (brandSettings.seo as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return { title: text(seo.title), description: text(seo.description), keywords: text(seo.keywords), socialImage: text(seo.socialImage) };
}

/**
 * The store home page's <head> from Settings → SEO (the same on its free address and its own domain). The title is
 * absolute: the seller wrote all of it.
 */
export function storeHomeMetadata(
  store: { name: string; description?: string | null; logoUrl?: string | null; brandSettings?: Record<string, unknown> | null },
  canonicalUrl: string,
  googleVerification?: string,
): Metadata {
  const seo = storeSeoSettings(store.brandSettings);
  const title = seo.title || store.name;
  const description = seo.description || store.description || `Shop at ${store.name}`;
  const image = (HTTPS_IMAGE.test(seo.socialImage) ? seo.socialImage : null) || store.logoUrl || null;
  return {
    title: { absolute: title },
    description,
    keywords: seo.keywords || undefined,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, url: canonicalUrl, siteName: store.name, type: "website", images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : [] },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
    ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  };
}
