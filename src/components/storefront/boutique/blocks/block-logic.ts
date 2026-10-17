// Pure helpers for the ready-made store blocks (src/components/storefront/boutique/blocks). No framework imports,
// so tests/storefront-blocks.test.mjs loads this file with Node's type stripping.

import type { TemplateSectionNode } from "../../../../lib/store-templates/types.ts";
import { bestSellers, relatedProducts, type ShopperProduct } from "../../shopper/catalog.ts";
import { productDetailRows } from "../../../../../shared/product-types.ts";

// ─── Reading section content ─────────────────────────────────────────────────

export function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function sectionCopyOf(section: Pick<TemplateSectionNode, "blocks"> | undefined): Record<string, unknown> {
  return (section?.blocks?.find((entry) => entry.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

/** A whole number setting kept inside [min, max]; anything unreadable gives the fallback. */
export function intSetting(value: unknown, min: number, max: number, fallback: number) {
  const raw = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

export function boolSetting(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** "₦25,000", "25000", "25,000.50" → 25000 / 25000.5; null for anything else. */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// ─── Free-delivery progress ──────────────────────────────────────────────────

export interface ShippingProgress {
  threshold: number;
  remaining: number;
  /** 0–100, rounded down so the bar never shows full before it is. */
  percent: number;
  reached: boolean;
}

/** How far a bag is from free delivery. Null when there is no threshold to aim for. */
export function shippingProgress(subtotal: number, threshold: number | null | undefined): ShippingProgress | null {
  if (!threshold || !Number.isFinite(threshold) || threshold <= 0) return null;
  const spent = Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0;
  const remaining = Math.max(0, Math.ceil(threshold - spent));
  const reached = spent >= threshold;
  const percent = reached ? 100 : Math.min(99, Math.floor((spent / threshold) * 100));
  return { threshold, remaining, percent, reached };
}

/** The store's own free-delivery amount wins; the amount typed in the block is only a fallback. */
export function freeShippingThreshold(storeThreshold: number | null | undefined, entered: unknown) {
  if (typeof storeThreshold === "number" && storeThreshold > 0) return { amount: storeThreshold, source: "store" as const };
  const typed = parseAmount(entered);
  return typed ? { amount: typed, source: "block" as const } : null;
}

/** Fills {amount} in a seller's message ("Spend {amount} more for free delivery"). */
export function fillAmount(template: string, amount: string) {
  return template.includes("{amount}") ? template.split("{amount}").join(amount) : template;
}

// ─── Image hotspots (shop the look) ──────────────────────────────────────────

/** Pins stay inside the picture: 3%–97% on both axes so the dot and its ring are never cut off. */
export const HOTSPOT_MIN = 3;
export const HOTSPOT_MAX = 97;

export function clampHotspot(value: unknown, fallback = 50) {
  const raw = typeof value === "string" ? Number(value.replace("%", "").trim()) : value;
  const number = typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
  return Math.min(HOTSPOT_MAX, Math.max(HOTSPOT_MIN, Math.round(number * 10) / 10));
}

/** Which side of the pin the price card opens, so it stays inside the picture. */
export function hotspotTooltipPlacement(x: number, y: number) {
  return {
    horizontal: x > 62 ? ("left" as const) : x < 38 ? ("right" as const) : ("center" as const),
    vertical: y > 55 ? ("above" as const) : ("below" as const),
  };
}

export interface Hotspot {
  index: number;
  x: number;
  y: number;
  productId: string;
  label: string;
}

/** Pins that point at a product the store still sells, with clamped positions. */
export function readHotspots(items: Array<Record<string, unknown>> | undefined, productIds: Set<string>): Hotspot[] {
  return (items ?? []).flatMap((item, index) => {
    const link = item.link && typeof item.link === "object" ? (item.link as Record<string, unknown>) : null;
    const productId = str(link?.type === "product" ? link.value : item.productId);
    if (!productId || !productIds.has(productId)) return [];
    return [{ index, x: clampHotspot(item.x), y: clampHotspot(item.y), productId, label: str(item.label) }];
  });
}

// ─── Recent sales pop ────────────────────────────────────────────────────────

/**
 * Only a first name, never a surname, email, phone or handle: the first word, letters only (any alphabet), up to 16
 * characters. Anything that looks like contact details gives "".
 */
export function safeFirstName(raw: unknown) {
  const value = str(raw);
  if (!value || /@|\d{3,}|https?:|www\./i.test(value)) return "";
  const first = value.split(/[\s,]+/)[0] ?? "";
  const letters = first.replace(/[^\p{L}'-]/gu, "").replace(/^['-]+|['-]+$/g, "");
  if (!letters) return "";
  const clipped = letters.slice(0, 16);
  return clipped.charAt(0).toLocaleUpperCase() + clipped.slice(1);
}

/** A town or city name only: letters, spaces and hyphens, up to 24 characters; no street numbers or addresses. */
export function safeCity(raw: unknown) {
  const value = str(raw);
  if (!value || /@|\d|https?:|www\./i.test(value)) return "";
  const first = value.split(",")[0] ?? "";
  return first.replace(/[^\p{L}\s'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
}

export interface SalePop {
  firstName: string;
  city: string;
  productId: string;
  when: string;
}

/** Seller-entered sales, cleaned to first name + city, only those pointing at a product the store sells. */
export function readSalePops(items: Array<Record<string, unknown>> | undefined, productIds: Set<string>): SalePop[] {
  return (items ?? []).flatMap((item) => {
    const link = item.link && typeof item.link === "object" ? (item.link as Record<string, unknown>) : null;
    const productId = str(link?.type === "product" ? link.value : item.productId);
    const city = safeCity(item.city);
    if (!productId || !productIds.has(productId) || !city) return [];
    return [{ firstName: safeFirstName(item.name), city, productId, when: str(item.when).slice(0, 24) }];
  });
}

export function salePopSentence(pop: Pick<SalePop, "firstName" | "city">) {
  return `${pop.firstName || "Someone"} in ${pop.city} just bought`;
}

// ─── Pop-up frequency ────────────────────────────────────────────────────────

export interface PopupMemory {
  lastShownAt: number | null;
  /** They signed up or closed it this visit. */
  shownThisSession: boolean;
  signedUp: boolean;
}

/** At most once a visit, never after signing up, and not again within `frequencyDays` (0 = every visit). */
export function promoPopupDue(memory: PopupMemory, frequencyDays: number, now = Date.now()) {
  if (memory.signedUp || memory.shownThisSession) return false;
  if (!memory.lastShownAt || frequencyDays <= 0) return true;
  return now - memory.lastShownAt >= frequencyDays * 86_400_000;
}

/** Desktop waits for the pointer to leave the window; phones (no exit intent) wait for the delay. */
export function promoPopupTrigger(isPhone: boolean, setting: string): "exit" | "delay" {
  if (isPhone) return "delay";
  return setting === "delay" ? "delay" : "exit";
}

export function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function looksLikePhone(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15 && /^[+\d\s()-]+$/.test(value.trim());
}

/** Validates the pop-up's one field for the kind of contact the seller asked for. */
export function leadField(value: string, kind: string): { email: string } | { phone: string } | null {
  const clean = value.trim();
  if (kind !== "phone" && looksLikeEmail(clean)) return { email: clean };
  if (kind !== "email" && looksLikePhone(clean)) return { phone: clean };
  return null;
}

// ─── Product lists ───────────────────────────────────────────────────────────

export function onSale(product: Pick<ShopperProduct, "retailPrice" | "compareAtPrice">) {
  return typeof product.compareAtPrice === "number" && product.compareAtPrice > product.retailPrice;
}

/** Percent off, rounded, for sale badges ("-20%"). */
export function percentOff(product: Pick<ShopperProduct, "retailPrice" | "compareAtPrice">) {
  if (!onSale(product)) return 0;
  return Math.round((1 - product.retailPrice / product.compareAtPrice!) * 100);
}

export type ProductTab = "best" | "new" | "sale";

/** Products for one tab: best sellers by reviews, new arrivals in the store's newest-first order, on sale by discount. */
export function tabProducts<P extends ShopperProduct>(products: P[], tab: ProductTab, limit: number) {
  if (tab === "best") return bestSellers(products).slice(0, limit);
  if (tab === "sale") return products.filter(onSale).sort((a, b) => percentOff(b) - percentOff(a)).slice(0, limit);
  return products.slice(0, limit);
}

export type ProductSource = "best-sellers" | "new" | "sale" | "collection" | "picked";

/** Hand-picked products (in order) for "picked"; otherwise picked ones first, then the source list. */
export function blockProducts<P extends ShopperProduct>(input: {
  products: P[];
  source: string;
  pickedIds: string[];
  collectionProductIds?: string[] | null;
  limit: number;
}): P[] {
  const byId = new Map(input.products.map((product) => [product.id, product]));
  const picked = input.pickedIds.map((id) => byId.get(id)).filter((product): product is P => Boolean(product));
  if (input.source === "picked") return picked.slice(0, input.limit);
  let pool: P[];
  if (input.source === "collection" && input.collectionProductIds) pool = input.products.filter((product) => input.collectionProductIds!.includes(product.id));
  else if (input.source === "new") pool = input.products;
  else if (input.source === "sale") pool = input.products.filter(onSale);
  else pool = bestSellers(input.products);
  return [...picked, ...pool.filter((product) => !picked.includes(product))].slice(0, input.limit);
}

/**
 * "You may also like" on any page: products related (same type, category or tags) to what the shopper has in their
 * bag or looked at, most relevant seed first; then best sellers. Seeds themselves are left out.
 */
export function recommendProducts<P extends ShopperProduct>(seedIds: string[], products: P[], limit: number): P[] {
  const seeds = seedIds.map((id) => products.find((product) => product.id === id)).filter((product): product is P => Boolean(product));
  const exclude = new Set(seeds.map((seed) => seed.id));
  const out: P[] = [];
  const add = (product: P) => {
    if (out.length < limit && !exclude.has(product.id) && !out.includes(product)) out.push(product);
  };
  for (const seed of seeds.slice(0, 4)) {
    // Only the genuinely related ones: same category, type or a shared tag.
    const tags = new Set((seed.tags ?? []).map((tag) => tag.toLowerCase()));
    for (const product of relatedProducts(seed, products, limit)) {
      const related = (seed.category?.slug && product.category?.slug === seed.category.slug)
        || (seed.productType && product.productType === seed.productType)
        || (product.tags ?? []).some((tag) => tags.has(tag.toLowerCase()));
      if (related) add(product);
    }
  }
  for (const product of bestSellers(products)) add(product);
  return out;
}

// ─── Comparison table ────────────────────────────────────────────────────────

export interface ComparisonRow {
  label: string;
  values: string[];
}

type ComparableProduct = ShopperProduct & { specifications?: unknown; productDetails?: unknown };

/**
 * Rows for 2–4 products: the details the seller filled in (product type fields and their own specifications), in
 * first-seen order, plus category. Rows nobody filled in are dropped; `only` (labels, any case) keeps those rows in
 * that order.
 */
export function comparisonRows(products: ComparableProduct[], only: string[] = []): ComparisonRow[] {
  const perProduct = products.map((product) => {
    const map = new Map<string, string>();
    if (product.category?.name) map.set("category", product.category.name);
    for (const row of productDetailRows({ productType: product.productType, productDetails: product.productDetails, specifications: product.specifications })) {
      if (!map.has(row.label.toLowerCase())) map.set(row.label.toLowerCase(), row.value);
    }
    return map;
  });
  const labels: string[] = [];
  const display = new Map<string, string>([["category", "Category"]]);
  products.forEach((product) => {
    if (product.category?.name && !labels.includes("category")) labels.push("category");
    for (const row of productDetailRows({ productType: product.productType, productDetails: product.productDetails, specifications: product.specifications })) {
      const key = row.label.toLowerCase();
      if (!labels.includes(key)) {
        labels.push(key);
        display.set(key, row.label);
      }
    }
  });
  const wanted = only.map((label) => label.trim().toLowerCase()).filter(Boolean);
  const order = wanted.length ? wanted.filter((label) => labels.includes(label)) : labels;
  return order.map((key) => ({ label: display.get(key) ?? key, values: perProduct.map((map) => map.get(key) ?? "") }));
}

// ─── Size finder ─────────────────────────────────────────────────────────────

export interface SizeRow {
  size: string;
  ranges: Array<{ min: number | null; max: number | null }>;
}

function num(value: unknown): number | null {
  const raw = typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : value;
  return typeof raw === "number" && Number.isFinite(raw) && (typeof value !== "string" || value.trim() !== "") ? raw : null;
}

/** The seller's size chart: each row a size with up to two measurement ranges (min–max). */
export function readSizeChart(items: Array<Record<string, unknown>> | undefined): SizeRow[] {
  return (items ?? []).flatMap((item) => {
    const size = str(item.size);
    if (!size) return [];
    return [{ size, ranges: [{ min: num(item.min1), max: num(item.max1) }, { min: num(item.min2), max: num(item.max2) }] }];
  });
}

/**
 * The size whose ranges contain every measurement given; otherwise the closest size (smallest total distance outside
 * its ranges), flagged as not exact. Null when nothing was measured or the chart is empty.
 */
export function recommendSize(chart: SizeRow[], measurements: Array<number | null>): { size: string; exact: boolean } | null {
  const given = measurements.map((value, index) => ({ value, index })).filter((entry): entry is { value: number; index: number } => typeof entry.value === "number" && Number.isFinite(entry.value));
  if (!chart.length || !given.length) return null;
  let best: { size: string; distance: number } | null = null;
  for (const row of chart) {
    let distance = 0;
    let usable = false;
    for (const { value, index } of given) {
      const range = row.ranges[index];
      if (!range || (range.min === null && range.max === null)) continue;
      usable = true;
      if (range.min !== null && value < range.min) distance += range.min - value;
      if (range.max !== null && value > range.max) distance += value - range.max;
    }
    if (!usable) continue;
    if (distance === 0) return { size: row.size, exact: true };
    if (!best || distance < best.distance) best = { size: row.size, distance };
  }
  return best ? { size: best.size, exact: false } : null;
}

// ─── FAQ search ──────────────────────────────────────────────────────────────

/** Questions whose question or answer contains every word typed (any case, accents ignored). */
export function filterFaq<T extends { question: string; answer: string }>(items: T[], query: string) {
  const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const haystack = fold(`${item.question} ${item.answer}`);
    return words.every((word) => haystack.includes(word));
  });
}

// ─── Motion ──────────────────────────────────────────────────────────────────

/** Seconds for one loop of the ticker: longer messages scroll for longer, so reading speed stays the same. */
export function tickerSeconds(totalCharacters: number, speed: string) {
  const perChar = speed === "slow" ? 0.32 : speed === "fast" ? 0.14 : 0.22;
  return Math.min(120, Math.max(12, Math.round(Math.max(1, totalCharacters) * perChar)));
}

/** Next index in a looping carousel. */
export function wrapIndex(index: number, count: number) {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}
