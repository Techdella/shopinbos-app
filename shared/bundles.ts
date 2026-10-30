// Product bundles ("Buy together"): a seller sells 2+ of their own products as one, at one price. Pure, shared by the
// bundle API (src/lib/products/bundles.server.ts), checkout (src/lib/commerce/pricing.server.ts), the storefront's
// "What's inside", the web form (/products/bundles) and the phone's "Make a bundle" screen. Tests:
// tests/bundles.test.mjs.
//
// A bundle is an ordinary StoreProduct (no table of its own): productDetails.bundle = { items: [{ productId,
// quantity }] } marks it (plus the tag "bundle" for filters). It holds no stock of its own (trackStock off): it can be
// bought while every item can, and a sale takes each item's stock (quantity × bundles bought) through the same stock
// holds as any order, so each item's sold count and stock stay right; the bundle's own sold count goes up too.

import { DEFAULT_LOW_STOCK_AT, type ShopperStock } from "./product-stock.ts";

export const BUNDLE_TAG = "bundle";
export const BUNDLE_MIN_ITEMS = 2;
export const BUNDLE_MAX_ITEMS = 10;
export const BUNDLE_MAX_QUANTITY = 20;
export const BUNDLE_NAME_MAX = 120;

export interface BundleItem {
  productId: string;
  quantity: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The items of a bundle as saved in productDetails, or null when the product isn't a bundle. */
export function readBundle(productDetails: unknown): BundleItem[] | null {
  const raw = record(productDetails).bundle;
  const items = record(raw).items;
  if (!Array.isArray(items)) return null;
  const out = items.flatMap((entry): BundleItem[] => {
    const item = record(entry);
    const quantity = Math.floor(Number(item.quantity));
    if (typeof item.productId !== "string" || !item.productId || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ productId: item.productId, quantity: Math.min(quantity, BUNDLE_MAX_QUANTITY) }];
  });
  return out.length ? out : null;
}

export function isBundleProduct(product: { productDetails?: unknown }) {
  return readBundle(product.productDetails) !== null;
}

/** productDetails with the bundle's items set (the seller's other details kept). */
export function bundleDetails(existing: unknown, items: BundleItem[]): Record<string, unknown> {
  return { ...record(existing), bundle: { items: items.map((item) => ({ productId: item.productId, quantity: item.quantity })) } };
}

/**
 * The product form saves productDetails as string details only (shared/product-types.ts readProductDetails), which
 * would drop the bundle: this puts the saved bundle back on what the form sends.
 */
export function keepBundle(stored: unknown, next: Record<string, string>): Record<string, unknown> {
  const items = readBundle(stored);
  return items ? bundleDetails(next, items) : next;
}

/** Two lines of the same product become one (quantities added). */
export function mergeBundleItems(items: Array<{ productId: string; quantity: number }>): BundleItem[] {
  const out = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    out.set(item.productId, (out.get(item.productId) ?? 0) + Math.floor(Number(item.quantity) || 0));
  }
  return [...out].map(([productId, quantity]) => ({ productId, quantity }));
}

// ─── Checking a bundle before it's saved ──────────────────────────────────────

/** A product the seller wants in a bundle, as the server loaded it. */
export interface BundlePart {
  id: string;
  storeId: string;
  name: string;
  retailPrice: number;
  costPrice?: number | null;
  status?: string | null;
  productDetails?: unknown;
  fulfillmentType?: string | null;
  supplierProductId?: string | null;
  /** The product's versions (sizes, colours…): a bundle can't say which one, so these can't go in. */
  variants?: unknown;
  preorderEnabled?: boolean | null;
}

export type BundleProblem = "name" | "price" | "too_few" | "too_many" | "quantity" | "missing" | "self" | "nested" | "dropship" | "versions" | "preorder" | "archived";

export type BundleCheck = { ok: true; items: BundleItem[] } | { ok: false; problem: BundleProblem; product?: string };

function hasVersions(variants: unknown) {
  return Array.isArray(variants) && variants.some((entry) => record(entry).enabled !== false);
}

/**
 * Whether a bundle can be saved: a name, a price above 0, 2 to 10 different products of this store (not archived),
 * 1 to 20 of each, never a bundle inside a bundle (or the bundle itself), and only the seller's own products without
 * versions or preorders (a bundle sells from the seller's shelf: it can't pick a size, wait for a ship date or ship
 * from a supplier).
 */
export function checkBundle(input: { storeId: string; name: string; price: number; items: Array<{ productId: string; quantity: number }>; selfId?: string | null }, parts: BundlePart[]): BundleCheck {
  if (!input.name.trim() || input.name.trim().length > BUNDLE_NAME_MAX) return { ok: false, problem: "name" };
  if (!Number.isFinite(input.price) || input.price <= 0) return { ok: false, problem: "price" };
  if (input.items.some((item) => !Number.isInteger(Number(item.quantity)) || item.quantity < 1 || item.quantity > BUNDLE_MAX_QUANTITY)) return { ok: false, problem: "quantity" };
  const items = mergeBundleItems(input.items);
  if (items.some((item) => item.quantity > BUNDLE_MAX_QUANTITY)) return { ok: false, problem: "quantity" };
  if (items.length < BUNDLE_MIN_ITEMS) return { ok: false, problem: "too_few" };
  if (items.length > BUNDLE_MAX_ITEMS) return { ok: false, problem: "too_many" };
  const byId = new Map(parts.map((part) => [part.id, part]));
  for (const item of items) {
    if (input.selfId && item.productId === input.selfId) return { ok: false, problem: "self" };
    const part = byId.get(item.productId);
    if (!part || part.storeId !== input.storeId) return { ok: false, problem: "missing" };
    const problem = partProblem(part);
    if (problem) return { ok: false, problem, product: part.name };
  }
  return { ok: true, items };
}

/** Why one of the store's products can't go in a bundle, or null when it can (the pickers list only these). */
export function partProblem(part: BundlePart): BundleProblem | null {
  if (part.status === "archived") return "archived";
  if (isBundleProduct(part)) return "nested";
  if (part.fulfillmentType === "dropship" || part.supplierProductId) return "dropship";
  if (hasVersions(part.variants)) return "versions";
  if (part.preorderEnabled) return "preorder";
  return null;
}

/** What the API answers for a problem (the web and phone forms show their own translated words first). */
export function bundleProblemMessage(problem: BundleProblem, product = "That product") {
  switch (problem) {
    case "name": return "Give the bundle a name.";
    case "price": return "Set a bundle price above 0.";
    case "too_few": return `Pick at least ${BUNDLE_MIN_ITEMS} different products.`;
    case "too_many": return `A bundle can hold up to ${BUNDLE_MAX_ITEMS} products.`;
    case "quantity": return `Each product can be 1 to ${BUNDLE_MAX_QUANTITY} pieces.`;
    case "missing": return "One of those products is no longer in your store.";
    case "self": return "A bundle can't hold itself.";
    case "nested": return `${product} is a bundle already. Pick its products instead.`;
    case "dropship": return `${product} ships from a supplier, so it can't go in a bundle.`;
    case "versions": return `${product} has sizes or options, so it can't go in a bundle yet.`;
    case "preorder": return `${product} is taking pre-orders, so it can't go in a bundle.`;
    case "archived": return `${product} is archived. Bring it back first.`;
  }
}

// ─── Price and saving ─────────────────────────────────────────────────────────

/** What the items cost bought one by one (their prices now). */
export function partsTotal(items: BundleItem[], priceOf: (productId: string) => number | null | undefined) {
  const total = items.reduce((sum, item) => sum + (Number(priceOf(item.productId)) || 0) * item.quantity, 0);
  return Math.round(total * 100) / 100;
}

/** The shopper's saving: the parts' total minus the bundle price (never below 0) and the percent off. */
export function bundleSaving(total: number, price: number) {
  const amount = Math.max(0, Math.round((total - price) * 100) / 100);
  const percent = total > 0 && amount > 0 ? Math.round((amount / total) * 100) : 0;
  return { amount, percent };
}

// ─── Stock ────────────────────────────────────────────────────────────────────

/** An item's stock as the database has it (raw counts, shared/product-stock.ts StockSettings). */
export interface PartStock {
  status?: string | null;
  trackStock?: boolean | null;
  currentStock?: number | null;
  reservedStock?: number | null;
  preorderEnabled?: boolean | null;
  fulfillmentType?: string | null;
}

/**
 * How many bundles one item allows: untracked stock never limits (null); tracked stock allows floor(left / quantity)
 * (a bundle never sells an item past 0, even one that keeps selling when out); an item that isn't for sale (gone,
 * unpublished, dropship or taking pre-orders) allows none.
 */
export function partLimit(part: PartStock | null | undefined, quantity: number): number | null {
  if (!part || (part.status && part.status !== "published") || part.preorderEnabled || part.fulfillmentType === "dropship") return 0;
  if (part.trackStock === false) return null;
  const left = Math.trunc(part.currentStock ?? 0) - Math.max(0, Math.trunc(part.reservedStock ?? 0));
  return Math.max(0, Math.floor(left / Math.max(1, quantity)));
}

/** Bundles that can be bought: the lowest over its items (null when no item tracks stock). */
export function bundleAvailable(items: BundleItem[], partOf: (productId: string) => PartStock | null | undefined): number | null {
  let lowest: number | null = null;
  for (const item of items) {
    const limit = partLimit(partOf(item.productId), item.quantity);
    if (limit !== null) lowest = lowest === null ? limit : Math.min(lowest, limit);
  }
  return lowest;
}

/** A bundle's stock as shoppers' pages get it (shared/product-stock.ts ShopperStock): null when nothing limits it. */
export function bundleShopperStock(items: BundleItem[], partOf: (productId: string) => PartStock | null | undefined): ShopperStock | null {
  const left = bundleAvailable(items, partOf);
  return left === null ? null : { left, lowAt: DEFAULT_LOW_STOCK_AT, continueSelling: false };
}

/**
 * The units each item gives for a bag: `lines` is product id → quantity in the bag; bundles (bundle id → items) give
 * their items' units (quantity each × bundles) instead. Products bought on their own and inside a bundle add up.
 */
export function bundleStockQuantities(lines: Map<string, number>, bundles: Map<string, BundleItem[]>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [productId, quantity] of lines) {
    const items = bundles.get(productId);
    if (!items) {
      out.set(productId, (out.get(productId) ?? 0) + quantity);
      continue;
    }
    for (const item of items) out.set(item.productId, (out.get(item.productId) ?? 0) + item.quantity * quantity);
  }
  return out;
}

// ─── What shoppers see ────────────────────────────────────────────────────────

/** "What's inside" on a bundle's product page. */
export interface BundleSummary {
  items: Array<{ id: string; name: string; image: string | null; quantity: number; price: number }>;
  /** The items bought one by one. */
  partsTotal: number;
  saving: { amount: number; percent: number };
}

export interface BundlePartRow extends PartStock {
  id: string;
  name: string;
  images?: string[] | null;
  retailPrice: number;
}

/** The bundle's "What's inside" and its stock, from its items' rows (items not found are left out of the list). */
export function bundleForShoppers(items: BundleItem[], price: number, rows: BundlePartRow[]): { summary: BundleSummary; stock: ShopperStock | null } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const list = items.flatMap((item) => {
    const row = byId.get(item.productId);
    return row ? [{ id: row.id, name: row.name, image: row.images?.[0] ?? null, quantity: item.quantity, price: row.retailPrice }] : [];
  });
  const total = partsTotal(items, (id) => byId.get(id)?.retailPrice);
  return { summary: { items: list, partsTotal: total, saving: bundleSaving(total, price) }, stock: bundleShopperStock(items, (id) => byId.get(id)) };
}

/**
 * Stock for the bundles in a list of products (a storefront catalogue): bundle id → its shopper stock, worked out
 * from the other rows in the same list (an item missing from the list isn't for sale).
 */
export function bundleStocks<T extends PartStock & { id: string; productDetails?: unknown }>(rows: T[]): Map<string, ShopperStock | null> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const out = new Map<string, ShopperStock | null>();
  for (const row of rows) {
    const items = readBundle(row.productDetails);
    if (items) out.set(row.id, bundleShopperStock(items, (id) => byId.get(id)));
  }
  return out;
}

/** What the web and phone forms say before saving (the server checks everything again). */
export function bundleDraftProblem(draft: { name: string; price: number | null; items: BundleItem[] }): BundleProblem | null {
  if (!draft.name.trim()) return "name";
  const items = mergeBundleItems(draft.items);
  if (items.length < BUNDLE_MIN_ITEMS) return "too_few";
  if (items.length > BUNDLE_MAX_ITEMS) return "too_many";
  if (items.some((item) => item.quantity < 1 || item.quantity > BUNDLE_MAX_QUANTITY)) return "quantity";
  if (draft.price === null || !Number.isFinite(draft.price) || draft.price <= 0) return "price";
  return null;
}
