// Colours and type for the shopper pages that sit outside the theme renderers (bag, wishlist, checkout,
// order): the store's published theme tokens, else its saved palette, else a neutral default.

import { BQ_GROTESK, BQ_SANS, BQ_SERIF } from "@/components/storefront/boutique/fonts";

export interface ShopperTheme {
  paper: string;
  surface: string;
  ink: string;
  muted: string;
  border: string;
  cta: string;
  ctaText: string;
  accent: string;
  headerBg: string;
  headerText: string;
  heading: string;
  body: string;
  /** Card corner radius in px. */
  radius: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function colour(value: unknown, fallback: string) {
  return typeof value === "string" && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\))$/i.test(value.trim()) ? value.trim() : fallback;
}

export function resolveShopperTheme(brandSettings: unknown): ShopperTheme {
  const settings = record(brandSettings);
  const published = record(record(record(settings.editor).published).themeTokens);
  const tokens = Object.keys(published).length ? published : record(settings.themeTokens);
  const palette = record(settings.palette);
  const pick = (key: string, paletteKey: string, fallback: string) => colour(tokens[key], colour(palette[paletteKey], fallback));
  const radius = tokens.radius === "sharp" ? 6 : tokens.radius === "soft" ? 14 : 20;
  return {
    paper: pick("paperBg", "paperBg", "#FAF7F1"),
    surface: pick("cardBg", "cardBg", "#FFFFFF"),
    ink: pick("ink", "ink", "#16141F"),
    muted: pick("muted", "muted", "#6E6E68"),
    border: pick("border", "border", "#E6E1D8"),
    cta: pick("ctaBg", "ctaBg", "#16141F"),
    ctaText: pick("ctaText", "ctaText", "#FFFFFF"),
    accent: pick("accent", "accent", "#F26B2B"),
    headerBg: pick("paperBg", "paperBg", "#FAF7F1"),
    headerText: pick("ink", "ink", "#16141F"),
    heading: tokens.headingStyle === "serif" ? BQ_SERIF : tokens.headingStyle === "grotesk" ? BQ_GROTESK : BQ_SANS,
    body: BQ_SANS,
    radius,
  };
}
