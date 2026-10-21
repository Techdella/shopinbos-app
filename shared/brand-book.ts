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

const SHAPE_LIMITS = {
  line: { paletteName: 40, tagline: 90, mission: 300 },
  lists: { colourNotes: [140, 4], logoRules: [140, 5], photoStyle: [140, 5], dos: [120, 5], donts: [120, 5] },
  voiceLists: { traits: [40, 4], wordsWeUse: [30, 8], wordsWeAvoid: [30, 8] },
} as const;

function clip(value: unknown, max: number) {
  if (typeof value !== "string") return value;
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

function clipList(value: unknown, max: number, count: number) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|;|•/) : [];
  return items
    .map((item) => clip(typeof item === "string" ? item.replace(/^[-*\d.)\s]+/, "") : item, max))
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, count);
}

/** "#abc", "abc", "#AABBCC80" and "rgb(1, 2, 3)" become #RRGGBB; anything else is left for the schema to reject. */
export function normaliseHex(value: unknown) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(text);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  const bare = text.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(bare)) return `#${[...bare].map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(bare)) return `#${bare.slice(0, 6)}`.toUpperCase();
  return text;
}

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * Tidies a style book as the model wrote it before it's checked: long lines are shortened, extra list items
 * dropped, colours written the usual other ways fixed, and "sans-serif" read as grotesk. Missing parts stay
 * missing, so the schema still rejects a book that really is incomplete.
 */
export function tidyBrandBook(raw: unknown): Record<string, unknown> {
  const book = record(raw);
  const out: Record<string, unknown> = { ...book };
  for (const [key, max] of Object.entries(SHAPE_LIMITS.line)) out[key] = clip(book[key], max);
  for (const [key, [max, count]] of Object.entries(SHAPE_LIMITS.lists)) if (key in book) out[key] = clipList(book[key], max, count);
  const colours = record(book.colours ?? book.colors);
  out.colours = Object.fromEntries(Object.entries(colours).map(([key, value]) => [key, normaliseHex(value)]));
  const type = record(book.typography);
  const style = typeof type.style === "string" ? type.style.toLowerCase() : "";
  out.typography = {
    ...type,
    headings: clip(type.headings, 40),
    body: clip(type.body, 40),
    style: style.includes("serif") && !style.includes("sans") ? "serif" : style ? "grotesk" : type.style,
    note: clip(type.note, 200),
  };
  const voice = record(book.voice);
  out.voice = { ...voice, summary: clip(voice.summary, 220), sampleCaption: clip(voice.sampleCaption, 240) };
  for (const [key, [max, count]] of Object.entries(SHAPE_LIMITS.voiceLists)) if (key in voice) (out.voice as Record<string, unknown>)[key] = clipList(voice[key], max, count);
  return out;
}

/** Which parts of a (tidied) style book are still wrong, for telling the model what to fix. */
export function brandBookProblems(value: unknown) {
  const parsed = BrandBookSchema.safeParse(value);
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "the whole book"))].slice(0, 12);
}

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
