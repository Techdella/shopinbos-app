// Validation for the StoreConfig Rex writes (store builder stream, build-store, onboarding drafts).
// Pure (zod only) so it is unit-tested in tests/behaviour.test.mjs.
import { z } from "zod";
import type { StoreConfig } from "../store-types.ts";

const HEX = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_PALETTE: StoreConfig["palette"] = {
  heroBg: "#0E2A38",
  heroText: "#FAF7F1",
  accent: "#73D8C8",
  ctaBg: "#73D8C8",
  ctaText: "#0E2A38",
  paperBg: "#FAF7F1",
};

const text = (max: number) =>
  z.preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().trim().max(max));

function hexOr(fallback: string) {
  return z.preprocess(
    (value) => (typeof value === "string" && /^#[0-9a-fA-F]{3}$/.test(value.trim())
      ? `#${value.trim().slice(1).split("").map((c) => c + c).join("")}`
      : typeof value === "string" ? value.trim() : value),
    z.string().regex(HEX),
  ).catch(fallback);
}

const ProductSchema = z.object({
  name: text(120).pipe(z.string().min(1)),
  subtitle: text(200).catch(""),
  price: text(40).catch(""),
  color: hexOr("#2E7E78"),
  // Only hosted images: data:, blob: and local previews never belong in a saved store.
  imageUrl: z.string().max(2000).regex(/^https?:\/\/\S+$/).optional().catch(undefined),
});

/** The shape Rex must produce. Missing or malformed optional parts fall back instead of failing. */
export const StoreConfigSchema = z.object({
  name: text(80).pipe(z.string().min(1)),
  slug: text(80).optional().catch(undefined),
  tagline: text(160).catch(""),
  heroHeadline: text(240).catch(""),
  heroSubline: text(400).catch(""),
  heroCtaText: text(40).catch("Shop now"),
  logoUrl: z.string().max(2000).regex(/^https?:\/\/\S+$/).nullable().optional().catch(undefined),
  palette: z
    .object({
      heroBg: hexOr(DEFAULT_PALETTE.heroBg),
      heroText: hexOr(DEFAULT_PALETTE.heroText),
      accent: hexOr(DEFAULT_PALETTE.accent),
      ctaBg: hexOr(DEFAULT_PALETTE.ctaBg),
      ctaText: hexOr(DEFAULT_PALETTE.ctaText),
      paperBg: hexOr(DEFAULT_PALETTE.paperBg),
    })
    .catch(DEFAULT_PALETTE),
  fontStyle: z.enum(["fraunces", "grotesk"]).catch("fraunces"),
  navLinks: z.array(text(40)).max(10).catch(["Products", "About", "FAQ", "Contact"]),
  products: z
    .array(z.unknown())
    .max(40)
    .catch([])
    .transform((items) =>
      items
        .map((item) => ProductSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
        .slice(0, 12),
    ),
  changed: z.array(z.string()).max(20).catch([]),
});

export function slugifyStoreName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export type StoreConfigResult = { ok: true; config: StoreConfig } | { ok: false; error: string };

/**
 * Validates a StoreConfig from a model. `base` (the store as it is now) fills anything the model left out,
 * so a partial edit ("make it green") keeps the rest of the store.
 */
export function validateStoreConfig(raw: unknown, base?: Partial<StoreConfig> | null): StoreConfigResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "The store design was not a JSON object." };
  const record = raw as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...(base ?? {}), ...record };
  if (base?.palette && record.palette && typeof record.palette === "object") {
    merged.palette = { ...base.palette, ...(record.palette as Record<string, unknown>) };
  }
  if (!Array.isArray(record.products) && Array.isArray(base?.products)) merged.products = base.products;
  const parsed = StoreConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The store design is missing ${issue?.path.join(".") || "required fields"}.` };
  }
  const data = parsed.data;
  // Keep product images the seller already has when the model drops them (matched by position, then name).
  const previous = base?.products ?? [];
  const products = data.products.map((product, index) => {
    if (product.imageUrl) return product;
    const kept = previous.find((item) => item.imageUrl && item.name.trim().toLowerCase() === product.name.toLowerCase())?.imageUrl
      ?? previous[index]?.imageUrl;
    return kept ? { ...product, imageUrl: kept } : product;
  });
  const config: StoreConfig = {
    name: data.name,
    slug: data.slug ? slugifyStoreName(data.slug) || slugifyStoreName(data.name) : slugifyStoreName(data.name),
    tagline: data.tagline,
    heroHeadline: data.heroHeadline || data.name,
    heroSubline: data.heroSubline || data.tagline,
    heroCtaText: data.heroCtaText || "Shop now",
    ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
    palette: data.palette,
    fontStyle: data.fontStyle,
    navLinks: data.navLinks.filter(Boolean).length ? data.navLinks.filter(Boolean) : ["Products", "About", "FAQ", "Contact"],
    products,
    changed: data.changed,
  };
  return { ok: true, config };
}

const CURRENCY_MARKERS: Array<[RegExp, string]> = [
  [/GH₵|GHS|GH¢|cedi/i, "GHS"],
  [/KSh|KES/i, "KES"],
  [/₦|NGN|naira/i, "NGN"],
  [/ZAR|\bR\s?\d/, "ZAR"],
  [/\$|USD/, "USD"],
];

/** "₦2,500" → 2500, "GH₵ 45.50" → 45.5, "KSh 1,200" → 1200. Null when there's no usable number. */
export function parsePrice(price: string | number | null | undefined): number | null {
  if (typeof price === "number") return Number.isFinite(price) && price >= 0 ? price : null;
  if (!price) return null;
  const match = price.replace(/,(?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function currencyFromPrice(price: string | null | undefined): string | null {
  if (!price) return null;
  for (const [pattern, code] of CURRENCY_MARKERS) if (pattern.test(price)) return code;
  return null;
}
