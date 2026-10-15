// The brand style book Rex writes for a store (Brand kit > Style book, /home/brand-kit/book): colours with their
// jobs, type, voice, logo and photo rules. Saved in Store.brandSettings.styleBook; the colours can be applied to
// the store's theme. Pure, unit-tested in tests/behaviour.test.mjs.

import { z } from "zod";

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().trim().regex(HEX, "Colours must be #RRGGBB");
const line = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, count: number) => z.array(line(max)).min(1).max(count);

export const BrandBookSchema = z.object({
  paletteName: line(40),
  tagline: line(90),
  mission: line(300),
  colours: z.object({
    primary: hex,
    secondary: hex,
    accent: hex,
    background: hex,
    surface: hex,
    text: hex,
  }),
  colourNotes: list(140, 4),
  typography: z.object({ headings: line(40), body: line(40), style: z.enum(["serif", "grotesk"]), note: line(200) }),
  voice: z.object({
    summary: line(220),
    traits: list(40, 4),
    wordsWeUse: list(30, 8),
    wordsWeAvoid: list(30, 8),
    sampleCaption: line(240),
  }),
  logoRules: list(140, 5),
  photoStyle: list(140, 5),
  dos: list(120, 5),
  donts: list(120, 5),
});

export type BrandBook = z.infer<typeof BrandBookSchema> & { updatedAt?: string };

/** Reads a saved style book (null when there is none or it no longer matches the shape). */
export function readBrandBook(value: unknown): BrandBook | null {
  const parsed = BrandBookSchema.safeParse(value);
  if (!parsed.success) return null;
  const updatedAt = value && typeof value === "object" && typeof (value as { updatedAt?: unknown }).updatedAt === "string" ? (value as { updatedAt: string }).updatedAt : undefined;
  return { ...parsed.data, ...(updatedAt ? { updatedAt } : {}) };
}

function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a #RRGGBB colour (0 black … 1 white). */
export function luminance(hexColour: string) {
  const n = Number.parseInt(hexColour.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two colours (1 … 21). */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on the colour. */
export function readableOn(background: string) {
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#111111") ? "#FFFFFF" : "#111111";
}

/**
 * The store theme tokens for a style book's colours: the primary colour is the accent and the buttons, the
 * secondary colour is the banner, background/surface/text are the page, cards and words. Text on buttons and
 * banners is black or white, whichever reads better.
 */
export function bookToThemeTokens(colours: BrandBook["colours"], style?: "serif" | "grotesk") {
  const text = contrastRatio(colours.text, colours.background) >= 4.5 ? colours.text : readableOn(colours.background);
  return {
    accent: colours.primary,
    ctaBg: colours.primary,
    ctaText: readableOn(colours.primary),
    heroBg: colours.secondary,
    heroText: readableOn(colours.secondary),
    paperBg: colours.background,
    cardBg: colours.surface,
    ink: text,
    ...(style ? { headingStyle: style } : {}),
  };
}
