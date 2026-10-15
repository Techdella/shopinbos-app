// Product page settings for the classic (pre-2026) templates. Classic stores render the same product page as the
// 2026 themes (BoutiquePdp, with a look built from the classic theme's colours and fonts), so they read the same
// settings from the product page's "product-detail" section. The only difference is the starting point: classic
// sections were saved with their own `layout` (gallery-left, split, minimal, sticky-summary), which maps onto the new
// layouts so existing stores keep a sensible look. The seller's explicit choice (pdpLayout, galleryStyle…) wins.
// Pure (only relative imports of pure modules), so the behaviour tests load it directly.

import {
  PDP_GALLERY_OPTIONS,
  PDP_LAYOUT_OPTIONS,
  pdpSectionOf,
  readPdpSettings,
  type PdpDetailsStyle,
  type PdpGalleryStyle,
  type PdpLayout,
  type PdpSettings,
} from "./pdp-logic.ts";
import { storeFaqSection } from "../faq/faq-logic.ts";

export type ClassicProductLayout = "gallery-left" | "split" | "minimal" | "sticky-summary";

export interface ClassicPdpDefaults {
  layout: PdpLayout;
  gallery: PdpGalleryStyle;
  details: PdpDetailsStyle;
}

/** The classic product section layouts, in the order the builder used to offer them; the first is the default. */
export const CLASSIC_PRODUCT_LAYOUTS: ClassicProductLayout[] = ["gallery-left", "split", "minimal", "sticky-summary"];
export const CLASSIC_DEFAULT_PRODUCT_LAYOUT: ClassicProductLayout = "gallery-left";

/** What each classic layout becomes on the shared product page. */
export const CLASSIC_PDP_DEFAULTS: Record<ClassicProductLayout, ClassicPdpDefaults> = {
  // Thumbnails beside the main photo, buying panel on the right.
  "gallery-left": { layout: "classic", gallery: "thumbs-left", details: "accordion" },
  // Photo and buying panel side by side.
  split: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  // A simple page: smaller photo, everything else in one wide panel.
  minimal: { layout: "compact", gallery: "thumbs-bottom", details: "accordion" },
  // Buying controls stay in view while the photos scroll by.
  "sticky-summary": { layout: "gallery-stack", gallery: "thumbs-bottom", details: "accordion" },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** A classic section's saved `layout` as one of the four classic layouts (unknown and missing values: the default). */
export function classicProductLayout(value: unknown): ClassicProductLayout {
  return oneOf(value, CLASSIC_PRODUCT_LAYOUTS) ?? CLASSIC_DEFAULT_PRODUCT_LAYOUT;
}

/** The shared product page's layout, photos and details style for a classic section's saved `layout`. */
export function classicPdpDefaults(legacyLayout: unknown): ClassicPdpDefaults {
  return CLASSIC_PDP_DEFAULTS[classicProductLayout(legacyLayout)];
}

/** The add-to-cart wording a classic store picked in its cart settings (brandSettings.cartConfig.addToCartLabel). */
const CART_LABELS: Record<string, string> = {
  add_to_cart: "Add to cart",
  bag: "Add to bag",
  basket: "Add to basket",
  buy_now: "Buy now",
  order_now: "Order now",
};

export function classicCartButtonLabel(cartConfig: unknown): string {
  const key = str(record(cartConfig).addToCartLabel) || "add_to_cart";
  return CART_LABELS[key] ?? CART_LABELS.add_to_cart!;
}

/** True when the store sells with one "Buy now" button that goes straight to checkout. */
export function classicBuyNowOnly(cartConfig: unknown): boolean {
  return str(record(cartConfig).addToCartLabel) === "buy_now";
}

interface SectionLike {
  kind?: string;
  settings?: Record<string, unknown>;
  blocks?: Array<{ type?: string; content?: unknown }>;
}

interface SnapshotLike {
  pages?: Array<{ pageType?: string; sections?: SectionLike[] }>;
}

const LAYOUTS = PDP_LAYOUT_OPTIONS.map((option) => option.value);
const GALLERIES = PDP_GALLERY_OPTIONS.map((option) => option.value);

export interface ClassicPdpOptions {
  /** Heading for the related products rail when the seller set none. */
  relatedFallback?: string;
  /** Add-to-bag wording when the seller set none on the product page (the store's cart setting). */
  addToBagFallback?: string;
  /** The store's FAQ section: the product page's questions follow its style and can add its questions. */
  faqSection?: { settings?: Record<string, unknown>; items?: Array<Record<string, unknown>> } | null;
}

/**
 * Product page settings for a classic store's product-detail section: the same settings as the 2026 themes, with the
 * section's classic `layout` as the starting layout, photos and details style.
 */
export function readClassicPdpSettings(section: SectionLike | null | undefined, options: ClassicPdpOptions = {}): PdpSettings {
  const base = readPdpSettings(section, "", options.relatedFallback ?? "", { section: options.faqSection ?? null, renderer: "classic" });
  const settings = record(section?.settings);
  const copy = record(section?.blocks?.find((block) => block.type === "copy")?.content);
  const defaults = classicPdpDefaults(settings.layout);
  return {
    ...base,
    layout: oneOf(settings.pdpLayout, LAYOUTS) ?? defaults.layout,
    gallery: oneOf(settings.galleryStyle, GALLERIES) ?? defaults.gallery,
    details: oneOf(settings.detailsStyle, ["accordion", "tabs"] as const) ?? defaults.details,
    labels: { ...base.labels, addToBag: str(copy.addToBagLabel) || str(options.addToBagFallback) || base.labels.addToBag },
  };
}

/** Classic product page settings for a store snapshot (draft in the builder, published on the live store). */
export function classicPdpSettingsForSnapshot(snapshot: SnapshotLike | null | undefined, options: ClassicPdpOptions = {}): PdpSettings {
  const page = snapshot?.pages?.find((entry) => entry.pageType === "product");
  const related = page?.sections?.find((entry) => entry.kind === "featured-products" && entry.settings?.source === "related");
  const relatedTitle = str(record(related?.blocks?.find((block) => block.type === "copy")?.content).title);
  return readClassicPdpSettings(pdpSectionOf(snapshot), { faqSection: storeFaqSection(snapshot), ...options, relatedFallback: relatedTitle || options.relatedFallback });
}
