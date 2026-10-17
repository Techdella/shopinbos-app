import type { Metadata } from "next";

// What every page of a store sets in the browser tab and in link previews, from Settings → SEO: its own favicon
// (else its logo) instead of the Shopinbos icon, and "<page> | <store>" titles instead of "| Shopinbos".
// Pages that set an absolute title (the home page, previews) keep it.

const HTTPS_IMAGE = /^https:\/\/\S+$/i;

export function storeFaviconUrl(brand: { logoUrl?: string | null; brandSettings?: Record<string, unknown> | null }) {
  const seo = brand.brandSettings?.seo;
  const favicon = seo && typeof seo === "object" ? (seo as Record<string, unknown>).favicon : null;
  if (typeof favicon === "string" && HTTPS_IMAGE.test(favicon.trim())) return favicon.trim();
  // Then the square logo icon (Brand kit), then the logo.
  const icon = brand.brandSettings?.logoIcon;
  if (typeof icon === "string" && HTTPS_IMAGE.test(icon.trim())) return icon.trim();
  if (brand.logoUrl && HTTPS_IMAGE.test(brand.logoUrl)) return brand.logoUrl;
  return null;
}

/**
 * `origin`: the store's canonical origin (https://adas.ng, https://adas.mybos.store…), so relative links in its
 * metadata resolve there instead of on the app's domain.
 */
export function storeHeadMetadata(brand: { name: string; logoUrl?: string | null; brandSettings?: Record<string, unknown> | null } | null, origin?: string | null): Metadata {
  if (!brand) return {};
  const icon = storeFaviconUrl(brand);
  let metadataBase: URL | undefined;
  try {
    metadataBase = origin ? new URL(new URL(origin).origin) : undefined;
  } catch {
    metadataBase = undefined;
  }
  return {
    ...(metadataBase ? { metadataBase } : {}),
    title: { default: brand.name, template: `%s | ${brand.name}` },
    // An empty list hides the Shopinbos icon when the store has neither a favicon nor a logo.
    icons: icon ? { icon: [{ url: icon }], apple: [{ url: icon }] } : { icon: [], apple: [] },
    applicationName: brand.name,
    openGraph: { siteName: brand.name },
  };
}

/** A verification token as the seller pasted it: the bare code, or the whole <meta … content="…"> tag. */
export function verificationToken(raw: unknown) {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  const fromTag = value.match(/content\s*=\s*["']([^"']+)["']/i)?.[1] ?? value;
  const token = fromTag.trim();
  return /^[A-Za-z0-9_\-:.=+/]{4,200}$/.test(token) ? token : "";
}

/**
 * Site-ownership meta tags for search consoles and ad platforms, from the store's integrations settings
 * (brandSettings.integrations): Google Search Console (gaSiteVerification or googleSiteVerification), Bing
 * (bingSiteVerification), Yandex (yandexVerification), Pinterest (pinterestVerification) and Meta
 * (facebookDomainVerification). Spread into the home page's metadata; unknown or malformed values are skipped.
 */
export function storeVerificationMeta(integrations: unknown): Pick<Metadata, "verification"> {
  const i = integrations && typeof integrations === "object" && !Array.isArray(integrations) ? (integrations as Record<string, unknown>) : {};
  const google = verificationToken(i.googleSiteVerification) || verificationToken(i.gaSiteVerification);
  const yandex = verificationToken(i.yandexVerification);
  const other: Record<string, string> = {};
  const bing = verificationToken(i.bingSiteVerification);
  if (bing) other["msvalidate.01"] = bing;
  const pinterest = verificationToken(i.pinterestVerification);
  if (pinterest) other["p:domain_verify"] = pinterest;
  const facebook = verificationToken(i.facebookDomainVerification);
  if (facebook) other["facebook-domain-verification"] = facebook;
  if (!google && !yandex && !Object.keys(other).length) return {};
  return { verification: { ...(google ? { google } : {}), ...(yandex ? { yandex } : {}), ...(Object.keys(other).length ? { other } : {}) } };
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
