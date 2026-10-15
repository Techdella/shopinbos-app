// The three brand marks a store has (Brand kit): the logo (Store.logoUrl), the logo icon, a square mark for small
// places like app icons and profile pictures (brandSettings.logoIcon), and the favicon shown in browser tabs
// (brandSettings.seo.favicon). Each falls back to the next one so a store always shows something. Pure.

const HTTPS_IMAGE = /^https:\/\/\S+$/i;

export type BrandAssetKind = "logo" | "icon" | "favicon";
export const BRAND_ASSET_KINDS: BrandAssetKind[] = ["logo", "icon", "favicon"];

function url(value: unknown) {
  return typeof value === "string" && HTTPS_IMAGE.test(value.trim()) ? value.trim() : null;
}

export interface BrandAssets {
  logo: string | null;
  /** Set by the seller, or null (then the logo stands in). */
  icon: string | null;
  favicon: string | null;
  /** What actually shows: the icon falls back to the logo; the favicon to the icon, then the logo. */
  shown: { icon: string | null; favicon: string | null };
}

export function readBrandAssets(store: { logoUrl?: string | null; brandSettings?: unknown }): BrandAssets {
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const seo = settings.seo && typeof settings.seo === "object" && !Array.isArray(settings.seo) ? (settings.seo as Record<string, unknown>) : {};
  const logo = url(store.logoUrl);
  const icon = url(settings.logoIcon);
  const favicon = url(seo.favicon);
  return { logo, icon, favicon, shown: { icon: icon ?? logo, favicon: favicon ?? icon ?? logo } };
}
