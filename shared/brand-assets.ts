// The three brand marks a store has (Brand kit): the logo (Store.logoUrl), the logo icon, a square mark for small
// places like app icons and profile pictures (brandSettings.logoIcon), and the favicon shown in browser tabs
// (brandSettings.seo.favicon). Each falls back to the next one so a store always shows something. The logo also has
// a version for dark backgrounds (brandSettings.logoVariants, shared/logo-variants.ts). Pure.

import { chooseLogo, readLogoVariantsRecord, readStoreLogo, type LogoChoice, type LogoVariantsRecord } from "./logo-variants.ts";

const HTTPS_IMAGE = /^https:\/\/\S+$/i;

/** logoDark: the seller's own logo for dark backgrounds (null goes back to the automatic one). */
export type BrandAssetKind = "logo" | "icon" | "favicon" | "logoDark";
export const BRAND_ASSET_KINDS: BrandAssetKind[] = ["logo", "icon", "favicon", "logoDark"];

function url(value: unknown) {
  return typeof value === "string" && HTTPS_IMAGE.test(value.trim()) ? value.trim() : null;
}

export interface BrandAssets {
  logo: string | null;
  /** Set by the seller, or null (then the logo stands in). */
  icon: string | null;
  favicon: string | null;
  /** The seller's own logo for dark backgrounds, or null. */
  logoDark: string | null;
  /** How the logo shows on a dark header or footer (its dark version, a re-inked mark or a light tile). */
  onDark: LogoChoice | null;
  /** brandSettings.logoVariants as saved (public; the builder preview renders from it). */
  logoVariants: LogoVariantsRecord | null;
  /** What actually shows: the icon falls back to the logo; the favicon to the icon, then the logo. */
  shown: { icon: string | null; favicon: string | null };
}

export function readBrandAssets(store: { logoUrl?: string | null; brandSettings?: unknown }): BrandAssets {
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const seo = settings.seo && typeof settings.seo === "object" && !Array.isArray(settings.seo) ? (settings.seo as Record<string, unknown>) : {};
  const logo = url(store.logoUrl);
  const icon = url(settings.logoIcon);
  const favicon = url(seo.favicon);
  const storeLogo = readStoreLogo({ logoUrl: logo, brandSettings: store.brandSettings });
  return { logo, icon, favicon, logoDark: storeLogo.darkFromSeller ? storeLogo.dark : null, onDark: chooseLogo(storeLogo, true), logoVariants: readLogoVariantsRecord(store.brandSettings), shown: { icon: icon ?? logo, favicon: favicon ?? icon ?? logo } };
}
