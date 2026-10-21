// Product page (PDP) settings and pure helpers for the 2026 themes. The settings live on the product page's
// "product-detail" section in the store's editor snapshot (settings + copy block), so the builder edits the draft
// and the live product route reads the published snapshot; they apply to every product.
// Pure (only a relative import of another pure module), so the behaviour tests load it directly.

import { formatStoreMoney, freeDeliveryEverywhereOver, freeDeliveryPromise, type StorefrontShopperInfo } from "../../../../lib/storefront/shopper-info.ts";
import { stockAvailability, type Availability, type ShopperStock } from "../../../../../shared/product-stock.ts";
import { faqSectionStyle, readFaqStyle, readStoreFaqItems, storeFaqSection, FAQ_STYLE_OPTIONS, type FaqRenderer, type FaqStyle, type StoreFaqItem } from "../faq/faq-logic.ts";

export type PdpLayout = "classic" | "gallery-stack" | "editorial" | "compact";
export type PdpGalleryStyle = "thumbs-left" | "thumbs-bottom" | "slider";
export type PdpDetailsStyle = "accordion" | "tabs";
export type PdpBuyBlock = "price" | "rating" | "summary" | "variants" | "stock" | "quantity" | "buttons" | "actions" | "trust" | "delivery";
export type PdpPageBlock = "details" | "reviews" | "related" | "recent";

export const PDP_LAYOUT_OPTIONS: Array<{ value: PdpLayout; label: string; hint: string }> = [
  { value: "classic", label: "Classic split", hint: "Photos left, buying panel right that stays in view." },
  { value: "gallery-stack", label: "Gallery stack", hint: "All photos down the page, buying panel sticks beside them." },
  { value: "editorial", label: "Editorial", hint: "One big photo across the page, details centred below." },
  { value: "compact", label: "Compact", hint: "Small gallery, room for many sizes and options." },
];

export const PDP_GALLERY_OPTIONS: Array<{ value: PdpGalleryStyle; label: string }> = [
  { value: "thumbs-left", label: "Thumbnails left" },
  { value: "thumbs-bottom", label: "Thumbnails below" },
  { value: "slider", label: "Slider" },
];

export const PDP_BUY_BLOCKS: Array<{ value: PdpBuyBlock; label: string }> = [
  { value: "price", label: "Price and savings" },
  { value: "rating", label: "Rating summary" },
  { value: "summary", label: "Short description" },
  { value: "variants", label: "Colours, sizes and options" },
  { value: "stock", label: "Stock status" },
  { value: "quantity", label: "Quantity" },
  { value: "buttons", label: "Add to bag and Buy now" },
  { value: "actions", label: "Wishlist, share and WhatsApp" },
  { value: "trust", label: "Trust badges" },
  { value: "delivery", label: "Delivery box" },
];

export const PDP_PAGE_BLOCKS: Array<{ value: PdpPageBlock; label: string }> = [
  { value: "details", label: "Product details" },
  { value: "reviews", label: "Reviews" },
  { value: "related", label: "Customers also like" },
  { value: "recent", label: "Recently viewed" },
];

/** The product page's question style: "auto" follows the store's FAQ section. */
export type PdpFaqStyleChoice = "auto" | FaqStyle;
/** Questions inside the product details (a tab or accordion panel), or as their own section below them. */
export type PdpFaqPlacement = "tab" | "section";

export const PDP_FAQ_STYLE_OPTIONS: Array<{ value: PdpFaqStyleChoice; label: string; hint: string }> = [
  { value: "auto", label: "Same as my FAQ section", hint: "Looks like the FAQ section on your pages." },
  ...FAQ_STYLE_OPTIONS,
];

export const PDP_FAQ_PLACEMENTS: Array<{ value: PdpFaqPlacement; label: string }> = [
  { value: "tab", label: "With product details" },
  { value: "section", label: "Own section" },
];

export const DEFAULT_BUY_BLOCKS: PdpBuyBlock[] = ["price", "rating", "summary", "variants", "stock", "quantity", "buttons", "actions", "trust", "delivery"];
export const DEFAULT_PAGE_BLOCKS: PdpPageBlock[] = ["details", "reviews", "related", "recent"];

export interface PdpSettings {
  layout: PdpLayout;
  gallery: PdpGalleryStyle;
  details: PdpDetailsStyle;
  /** Hover zoom and a full-screen lightbox on the photos. */
  zoom: boolean;
  /** Add-to-bag bar pinned to the bottom of phones once the main button scrolls away. */
  stickyBar: boolean;
  breadcrumbs: boolean;
  /** Buy box parts that show, in order (the title is always first). */
  buyBox: PdpBuyBlock[];
  /** Blocks under the product, in order. */
  sections: PdpPageBlock[];
  trust: {
    delivery: boolean;
    payOnDelivery: boolean;
    returns: boolean;
    deliveryText: string;
    payOnDeliveryText: string;
    returnsText: string;
    customText: string;
  };
  labels: {
    addToBag: string;
    buyNow: string;
    related: string;
    recent: string;
    reviews: string;
  };
  /** The product's questions (FAQs). */
  faq: PdpFaqSettings;
}

export interface PdpFaqSettings {
  /** The style the questions show in (the choice, or the FAQ section's style for "auto"). */
  style: FaqStyle;
  /** What the seller picked on the product page settings. */
  choice: PdpFaqStyleChoice;
  /** The store's FAQ section style, which "auto" follows. */
  sectionStyle: FaqStyle;
  title: string;
  placement: PdpFaqPlacement;
  /** The first question starts open (all closed otherwise). */
  firstOpen: boolean;
  /** Add the store's FAQ section questions after the product's own. */
  storeQuestions: boolean;
  /** The store's FAQ section questions (answers left blank are filled from settings when shown). */
  storeItems: StoreFaqItem[];
}

/** Where the store's FAQ section is, for "Same as my FAQ section" and the store's questions. */
export interface PdpFaqSource {
  section: { settings?: Record<string, unknown>; items?: Array<Record<string, unknown>> } | null;
  renderer?: FaqRenderer;
}

/** Product page question settings (settings.faq*, copy.faqTitle), following the store's FAQ section by default. */
export function readPdpFaqSettings(settings: Record<string, unknown>, copy: Record<string, unknown>, source: PdpFaqSource | null = null): PdpFaqSettings {
  const sectionStyle = faqSectionStyle(source?.section ?? null, source?.renderer ?? "boutique");
  const picked = readFaqStyle(settings.faqStyle);
  return {
    style: picked ?? sectionStyle,
    choice: picked ?? "auto",
    sectionStyle,
    title: str(copy.faqTitle) || "FAQs",
    placement: settings.faqPlacement === "section" ? "section" : "tab",
    firstOpen: settings.faqOpen === "first",
    storeQuestions: settings.faqStoreQuestions === true,
    storeItems: readStoreFaqItems(source?.section ?? null),
  };
}

interface ThemeDefault {
  layout: PdpLayout;
  gallery: PdpGalleryStyle;
  details: PdpDetailsStyle;
}

/** The product-detail `layout` values the 2026 seeds were written with (boutique-themes.ts PRODUCT_LAYOUT). */
const LEGACY_LAYOUT: Record<string, PdpLayout> = {
  "boutique-gallery": "classic",
  "spec-sheet": "compact",
  "editorial-gallery": "gallery-stack",
  "wide-gallery": "editorial",
  stacked: "compact",
};

/** Each theme's own product page: what suits its products and look. */
export const PDP_THEME_DEFAULTS: Record<string, ThemeDefault> = {
  breeze: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  noir: { layout: "classic", gallery: "thumbs-left", details: "accordion" },
  plain: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  adire: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "accordion" },
  pantry: { layout: "compact", gallery: "slider", details: "accordion" },
  ile: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "accordion" },
  plug: { layout: "compact", gallery: "thumbs-left", details: "tabs" },
  stride: { layout: "editorial", gallery: "slider", details: "tabs" },
  ewa: { layout: "classic", gallery: "thumbs-left", details: "accordion" },
  suku: { layout: "editorial", gallery: "thumbs-bottom", details: "accordion" },
  asoebi: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "accordion" },
  agbada: { layout: "gallery-stack", gallery: "thumbs-left", details: "accordion" },
  ileke: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "accordion" },
  ounje: { layout: "compact", gallery: "slider", details: "accordion" },
  chinchin: { layout: "compact", gallery: "slider", details: "accordion" },
  oja: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  omo: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  iwe: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "tabs" },
  owambe: { layout: "editorial", gallery: "thumbs-bottom", details: "accordion" },
  danfo: { layout: "compact", gallery: "thumbs-left", details: "tabs" },
  turare: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "accordion" },
  oko: { layout: "compact", gallery: "slider", details: "accordion" },
  aaro: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  highlife: { layout: "editorial", gallery: "slider", details: "tabs" },
  oba: { layout: "gallery-stack", gallery: "thumbs-left", details: "accordion" },
  gbedu: { layout: "editorial", gallery: "thumbs-bottom", details: "tabs" },
  omalicha: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  zuma: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "accordion" },
  oku: { layout: "editorial", gallery: "slider", details: "tabs" },
  ihe: { layout: "gallery-stack", gallery: "thumbs-left", details: "accordion" },
  kasuwa: { layout: "compact", gallery: "thumbs-left", details: "tabs" },
  nkata: { layout: "classic", gallery: "thumbs-left", details: "accordion" },
  uwa: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "tabs" },
  sarauniya: { layout: "editorial", gallery: "thumbs-bottom", details: "accordion" },
  zinariya: { layout: "gallery-stack", gallery: "thumbs-left", details: "accordion" },
  irawo: { layout: "editorial", gallery: "slider", details: "accordion" },
  asa: { layout: "compact", gallery: "thumbs-bottom", details: "accordion" },
  mmiri: { layout: "compact", gallery: "slider", details: "accordion" },
  uzo: { layout: "gallery-stack", gallery: "thumbs-bottom", details: "tabs" },
  rawa: { layout: "editorial", gallery: "slider", details: "tabs" },
  fitila: { layout: "gallery-stack", gallery: "thumbs-left", details: "accordion" },
  oso: { layout: "gallery-stack", gallery: "thumbs-left", details: "accordion" },
  shakara: { layout: "editorial", gallery: "thumbs-bottom", details: "tabs" },
  aga: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  itura: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  gele: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  imani: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  itanna: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  littafi: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  itan: { layout: "gallery-stack", gallery: "thumbs-left", details: "tabs" },
  awo: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  kyau: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  keke: { layout: "editorial", gallery: "slider", details: "tabs" },
  ahia: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  ado: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  wuta: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  ike: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  ewu: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  erin: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  apere: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  bata: { layout: "classic", gallery: "thumbs-left", details: "accordion" },
  ogba: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  eso: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  osan: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  ijokoo: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  ite: { layout: "classic", gallery: "thumbs-bottom", details: "accordion" },
  kujera: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  tufafi: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  rewa: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  igbese: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  ola: { layout: "gallery-stack", gallery: "thumbs-left", details: "accordion" },
  okunrin: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  salubata: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  efo: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  aluko: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  aja: { layout: "classic", gallery: "thumbs-bottom", details: "tabs" },
  dara: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
  ife: { layout: "editorial", gallery: "thumbs-left", details: "accordion" },
  irorun: { layout: "classic", gallery: "thumbs-left", details: "tabs" },
};

const FALLBACK_THEME: ThemeDefault = { layout: "classic", gallery: "thumbs-bottom", details: "accordion" };

export function pdpThemeDefaults(themeId: string): ThemeDefault {
  return PDP_THEME_DEFAULTS[themeId] ?? FALLBACK_THEME;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** An ordered list of known ids (duplicates and unknown ids dropped); the fallback when the value isn't a list. */
export function readOrder<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || seen.has(entry) || !(allowed as readonly string[]).includes(entry)) continue;
    seen.add(entry);
    out.push(entry as T);
  }
  return out;
}

interface SectionLike {
  kind?: string;
  visible?: boolean;
  settings?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  blocks?: Array<{ type?: string; content?: unknown }>;
}

interface SnapshotLike {
  pages?: Array<{ pageType?: string; sections?: SectionLike[] }>;
}

function copyOf(section: SectionLike | null | undefined) {
  return record(section?.blocks?.find((block) => block.type === "copy")?.content);
}

/** The product page's product-detail section, where PDP settings are stored. */
export function pdpSectionOf(snapshot: SnapshotLike | null | undefined): SectionLike | null {
  const page = snapshot?.pages?.find((entry) => entry.pageType === "product");
  return page?.sections?.find((entry) => entry.kind === "product-detail") ?? null;
}

/** The title of the product page's "related" products section (seeded per theme, e.g. "Goes well with"). */
function relatedSectionTitle(snapshot: SnapshotLike | null | undefined) {
  const page = snapshot?.pages?.find((entry) => entry.pageType === "product");
  const related = page?.sections?.find((entry) => entry.kind === "featured-products" && entry.settings?.source === "related");
  return str(copyOf(related).title);
}

const LAYOUTS = PDP_LAYOUT_OPTIONS.map((option) => option.value);
const GALLERIES = PDP_GALLERY_OPTIONS.map((option) => option.value);
const BUY_IDS = PDP_BUY_BLOCKS.map((option) => option.value);
const PAGE_IDS = PDP_PAGE_BLOCKS.map((option) => option.value);

/**
 * PDP settings from the product-detail section, with the theme's defaults for anything not set. Older snapshots
 * only have the seeded `layout` (boutique-gallery, spec-sheet…), which maps onto the new layouts.
 */
export function readPdpSettings(section: SectionLike | null | undefined, themeId: string, relatedFallback = "", faqSource: PdpFaqSource | null = null): PdpSettings {
  const theme = pdpThemeDefaults(themeId);
  const settings = record(section?.settings);
  const copy = copyOf(section);
  const legacy = typeof settings.layout === "string" ? LEGACY_LAYOUT[settings.layout] : undefined;
  return {
    layout: oneOf(settings.pdpLayout, LAYOUTS) ?? legacy ?? theme.layout,
    gallery: oneOf(settings.galleryStyle, GALLERIES) ?? theme.gallery,
    details: oneOf(settings.detailsStyle, ["accordion", "tabs"] as const) ?? theme.details,
    zoom: bool(settings.zoom, true),
    stickyBar: bool(settings.stickyBar, true),
    breadcrumbs: bool(settings.breadcrumbs, true),
    buyBox: readOrder(settings.buyBox, BUY_IDS, DEFAULT_BUY_BLOCKS),
    sections: readOrder(settings.pageBlocks, PAGE_IDS, DEFAULT_PAGE_BLOCKS),
    trust: {
      delivery: bool(settings.trustDelivery, true),
      payOnDelivery: bool(settings.trustPayOnDelivery, true),
      returns: bool(settings.trustReturns, true),
      deliveryText: str(copy.trustDeliveryText),
      payOnDeliveryText: str(copy.trustPodText),
      returnsText: str(copy.trustReturnsText),
      customText: str(copy.trustCustomText),
    },
    labels: {
      addToBag: str(copy.addToBagLabel) || "Add to bag",
      buyNow: str(copy.buyNowLabel) || "Buy now",
      related: str(copy.relatedTitle) || relatedFallback || "Customers also like",
      recent: str(copy.recentTitle) || "Recently viewed",
      reviews: str(copy.reviewsTitle) || "Customer reviews",
    },
    faq: readPdpFaqSettings(settings, copy, faqSource),
  };
}

/** PDP settings for a store snapshot (draft in the builder, published on the live store). */
export function pdpSettingsForSnapshot(snapshot: SnapshotLike | null | undefined, themeId: string): PdpSettings {
  return readPdpSettings(pdpSectionOf(snapshot), themeId, relatedSectionTitle(snapshot), { section: storeFaqSection(snapshot), renderer: "boutique" });
}

// ─── Inspector list helpers (the "order" field) ───────────────────────────────

/** Moves an id one place up (-1) or down (+1) in the list; unchanged at the ends or when absent. */
export function moveInOrder<T extends string>(list: readonly T[], id: T, direction: -1 | 1): T[] {
  const at = list.indexOf(id);
  const to = at + direction;
  if (at < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  next[at] = next[to]!;
  next[to] = id;
  return next;
}

/** Shows or hides an id. A shown id goes back near its default place (after the shown ids that precede it there). */
export function toggleInOrder<T extends string>(list: readonly T[], id: T, on: boolean, defaults: readonly T[]): T[] {
  const without = list.filter((entry) => entry !== id);
  if (!on) return without;
  const before = defaults.slice(0, Math.max(0, defaults.indexOf(id)));
  let insertAt = 0;
  without.forEach((entry, index) => {
    if (before.includes(entry)) insertAt = index + 1;
  });
  return [...without.slice(0, insertAt), id, ...without.slice(insertAt)];
}

// ─── Product helpers ─────────────────────────────────────────────────────────

/** Whole-percent saving against the compare-at price; null when there is no genuine discount. */
export function savingsPercent(price: number, compareAt: number | null | undefined): number | null {
  if (!Number.isFinite(price) || typeof compareAt !== "number" || !Number.isFinite(compareAt) || compareAt <= price || compareAt <= 0) return null;
  const percent = Math.round(((compareAt - price) / compareAt) * 100);
  return percent >= 1 ? percent : null;
}

export interface StockStatus {
  tone: "out" | "low" | "in";
  text: string;
}

/**
 * Whether the chosen product / version can be bought, the most one bag line may hold, and the buy box's stock line.
 * Only tracked stock counts (shared/product-stock.ts): the product's own when the seller tracks it (`stock`, with
 * versions' own counts), the supplier's for dropship. `soldOut`: the chosen version is off or at 0.
 */
export function pdpAvailability(input: { soldOut?: boolean; variantStock?: number | null; supplierStock?: number | null; stock?: ShopperStock | null }): Availability {
  return stockAvailability({ versionSoldOut: input.soldOut, variantStock: input.variantStock, supplierStock: input.supplierStock, stock: input.stock });
}

/** Stock line for the buy box ("Sold out", "Only 3 left", "In stock"); null when stock isn't tracked. */
export function stockStatus(input: Parameters<typeof pdpAvailability>[0]): StockStatus | null {
  const availability = pdpAvailability(input);
  return availability.tone !== "untracked" && availability.text ? { tone: availability.tone, text: availability.text } : null;
}

export interface SpecRow {
  name: string;
  value: string;
}

export function readSpecs(value: unknown): SpecRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => record(entry))
    .map((entry) => ({ name: str(entry.name), value: str(entry.value) }))
    .filter((entry) => entry.name && entry.value);
}

export interface FaqRow {
  question: string;
  answer: string;
}

export function readFaqs(value: unknown): FaqRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => record(entry))
    .map((entry) => ({ question: str(entry.question), answer: str(entry.answer) }))
    .filter((entry) => entry.question && entry.answer);
}

export interface PdpProductContent {
  description?: string | null;
  longDescription?: string | null;
  specifications?: unknown;
  careInstructions?: string | null;
  shippingInfo?: string | null;
  returnPolicy?: string | null;
  warranty?: string | null;
  supportInfo?: string | null;
  faqs?: unknown;
}

export type PdpPanelId = "description" | "specs" | "care" | "shipping" | "warranty" | "faqs";

/**
 * Detail panels that have something to say, in display order. Empty ones are left out. `specRowCount` is the
 * number of product-type and custom detail rows (productDetailRows); without it the specifications list counts.
 */
export function detailPanels(
  product: PdpProductContent,
  deliveryLineCount = 0,
  specRowCount?: number,
  faq: { count?: number; title?: string; inDetails?: boolean } = {},
): Array<{ id: PdpPanelId; title: string }> {
  const panels: Array<{ id: PdpPanelId; title: string }> = [];
  if (str(product.longDescription) || str(product.description)) panels.push({ id: "description", title: "Description" });
  if ((specRowCount ?? readSpecs(product.specifications).length) > 0) panels.push({ id: "specs", title: "Specifications" });
  if (str(product.careInstructions)) panels.push({ id: "care", title: "Care" });
  if (str(product.shippingInfo) || str(product.returnPolicy) || deliveryLineCount > 0) panels.push({ id: "shipping", title: "Shipping and returns" });
  if (str(product.warranty) || str(product.supportInfo)) panels.push({ id: "warranty", title: "Warranty and support" });
  // Questions: the product's own plus any store questions (`count`); left out when they have their own section.
  if (faq.inDetails !== false && (faq.count ?? readFaqs(product.faqs).length) > 0) panels.push({ id: "faqs", title: faq.title?.trim() || "FAQs" });
  return panels;
}

export interface TrustBadge {
  id: "delivery" | "payOnDelivery" | "returns" | "custom";
  icon: "truck" | "card" | "refresh" | "shield";
  title: string;
}

/** Trust badges from the seller's own settings: nothing is promised that the store hasn't set up. */
export function trustBadges(settings: PdpSettings["trust"], shopper: Pick<StorefrontShopperInfo, "delivery" | "flatRate" | "payOnDelivery">, product: { returnPolicy?: string | null }, currency = "NGN"): TrustBadge[] {
  const badges: TrustBadge[] = [];
  if (settings.delivery) {
    const everywhere = freeDeliveryEverywhereOver(shopper.delivery);
    const auto = everywhere !== null
      ? `Free delivery over ${formatStoreMoney(everywhere, currency)}`
      : freeDeliveryPromise(shopper.delivery)
        ?? (shopper.delivery.some((zone) => !zone.pickupOnly) || shopper.flatRate !== null ? "Delivery to your door" : "");
    const title = settings.deliveryText || auto;
    if (title) badges.push({ id: "delivery", icon: "truck", title });
  }
  if (settings.payOnDelivery && shopper.payOnDelivery) badges.push({ id: "payOnDelivery", icon: "card", title: settings.payOnDeliveryText || "Pay on delivery" });
  if (settings.returns && (settings.returnsText || str(product.returnPolicy))) badges.push({ id: "returns", icon: "refresh", title: settings.returnsText || "See return policy" });
  if (settings.customText) badges.push({ id: "custom", icon: "shield", title: settings.customText });
  return badges;
}

/** Recently viewed ids, newest first, without duplicates. */
export function pushRecentlyViewed(ids: unknown, id: string, max = 12): string[] {
  const list = Array.isArray(ids) ? ids.filter((entry): entry is string => typeof entry === "string" && entry !== id) : [];
  return [id, ...list].slice(0, max);
}

export function recentlyViewedKey(storeSlug: string) {
  return `shopinbos:recent:${storeSlug}`;
}

export type PdpVideo = { kind: "youtube" | "vimeo"; src: string } | { kind: "file"; src: string };

/** A product video as an embeddable source: YouTube and Vimeo links become embeds, other https links play as files. */
export function productVideo(url: unknown): PdpVideo | null {
  const raw = str(url);
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const id = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v") ?? parsed.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? "";
    return /^[\w-]{6,20}$/.test(id) ? { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parsed.pathname.match(/(\d{5,})/)?.[1];
    return id ? { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  return { kind: "file", src: parsed.toString() };
}

/** Star counts from 5 down to 1, with each one's share of the total (0-100). */
export function ratingBreakdown(reviews: ReadonlyArray<{ rating: number }>) {
  const counts = [0, 0, 0, 0, 0];
  for (const review of reviews) {
    const star = Math.round(review.rating);
    if (star >= 1 && star <= 5) counts[star - 1]!++;
  }
  const total = counts.reduce((sum, count) => sum + count, 0);
  return [5, 4, 3, 2, 1].map((star) => ({ star, count: counts[star - 1]!, percent: total ? Math.round((counts[star - 1]! / total) * 100) : 0 }));
}
