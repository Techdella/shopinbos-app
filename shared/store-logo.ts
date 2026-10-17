// How the store header shows the brand (Brand kit > "On your store", the builder's theme settings and Rex):
// the full logo, the logo icon, or just the name, each with or without the name beside it, at one of three
// sizes. Saved in Store.brandSettings.logoDisplay so it applies to the live store at once. Pure, unit-tested in
// tests/behaviour.test.mjs.

import { readBrandAssets } from "./brand-assets.ts";

export const LOGO_STYLES = ["logo_text", "logo", "icon_text", "icon", "text"] as const;
export type LogoStyle = (typeof LOGO_STYLES)[number];

export const LOGO_SIZES = ["small", "medium", "large"] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];

export interface LogoDisplay {
  style: LogoStyle;
  size: LogoSize;
}

export const DEFAULT_LOGO_DISPLAY: LogoDisplay = { style: "logo_text", size: "medium" };

/** Image height in pixels for each size (the full logo keeps its own width up to 4× that). */
export const LOGO_HEIGHT: Record<LogoSize, number> = { small: 32, medium: 44, large: 60 };

export function isLogoStyle(value: unknown): value is LogoStyle {
  return typeof value === "string" && (LOGO_STYLES as readonly string[]).includes(value);
}

export function isLogoSize(value: unknown): value is LogoSize {
  return typeof value === "string" && (LOGO_SIZES as readonly string[]).includes(value);
}

/** The saved choice, or the default for anything missing or unknown. */
export function readLogoDisplay(brandSettings: unknown): LogoDisplay {
  const settings = brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {};
  const raw = settings.logoDisplay && typeof settings.logoDisplay === "object" ? (settings.logoDisplay as Record<string, unknown>) : {};
  return { style: isLogoStyle(raw.style) ? raw.style : DEFAULT_LOGO_DISPLAY.style, size: isLogoSize(raw.size) ? raw.size : DEFAULT_LOGO_DISPLAY.size };
}

export interface StoreLogoView {
  /** The picture to show, or null for name only. */
  image: string | null;
  /** "logo" keeps its own shape (a wordmark can be wide); "icon" is a square. */
  shape: "logo" | "icon" | null;
  height: number;
  showName: boolean;
}

/**
 * What the header shows. Without a picture it falls back to the name, so a store never shows nothing; the icon
 * falls back to the logo (readBrandAssets).
 */
export function storeLogoView(store: { logoUrl?: string | null; brandSettings?: unknown }, display: LogoDisplay = readLogoDisplay(store.brandSettings)): StoreLogoView {
  const assets = readBrandAssets(store);
  const wantsIcon = display.style === "icon" || display.style === "icon_text";
  const image = display.style === "text" ? null : wantsIcon ? assets.shown.icon : assets.logo;
  const height = LOGO_HEIGHT[display.size];
  if (!image) return { image: null, shape: null, height, showName: true };
  return { image, shape: wantsIcon ? "icon" : "logo", height, showName: display.style === "logo_text" || display.style === "icon_text" };
}
