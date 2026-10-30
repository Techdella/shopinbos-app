// Product bundles ("Buy together"): a seller sells 2+ of their own products as one, at one price. Pure, shared by the
// bundle API (src/lib/products/bundles.server.ts), checkout (src/lib/commerce/pricing.server.ts), the storefront's
// "What's inside", the web form (/products/bundles) and the phone's "Make a bundle" screen. Tests:
// tests/bundles.test.mjs.
//
// A bundle is an ordinary StoreProduct (no table of its own): productDetails.bundle = { items: [{ productId,
// variantId?, quantity }] } marks it (plus the tag "bundle" for filters). It holds no stock of its own (trackStock
// off): it can be bought while every item can, and a sale takes each item's stock (quantity × bundles bought) through
// the same stock holds as any order, so each item's sold count and stock stay right; the bundle's own sold count goes
// up too.
//
// Sizes and options (shared/product-variants.ts): an item of a product with versions names one of them (variantId,
// e.g. "Ankara dress, size M × 1"); it then takes that version's stock and price exactly like buying it alone. The
// same product can be in a bundle twice with different versions. Items saved before versions were allowed have no
// variantId and still read the same.

import { DEFAULT_LOW_STOCK_AT, type ShopperStock } from "./product-stock.ts";
import { normalizeVariants, resolveLineVariant, variantPrice, type ProductVariant } from "./product-variants.ts";

export const BUNDLE_TAG = "bundle";
export const BUNDLE_MIN_ITEMS = 2;
export const BUNDLE_MAX_ITEMS = 10;
export const BUNDLE_MAX_QUANTITY = 20;
export const BUNDLE_NAME_MAX = 120;

export interface BundleItem {
  productId: string;
  /** The version (size / option) of a product that has versions; left out for products without. */
  variantId?: string;
  quantity: number;
}

/** A bundle line as forms and the API send it (variantId may be null or empty: no version). */
export type BundleItemInput = { productId: string; variantId?: string | null; quantity: number };

/** The item's product and version as one key ("dress::v-m"), so the same product with two versions is two lines. */
export const bundleItemKey = (item: { productId: string; variantId?: string | null }) => `${item.productId}::${item.variantId || ""}`;

function cleanItem(productId: string, variantId: unknown, quantity: number): BundleItem {
  return typeof variantId === "string" && variantId.trim() ? { productId, variantId: variantId.trim().slice(0, 80), quantity } : { productId, quantity };
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
    return [cleanItem(item.productId, item.variantId, Math.min(quantity, BUNDLE_MAX_QUANTITY))];
  });
  return out.length ? out : null;
}

export function isBundleProduct(product: { productDetails?: unknown }) {
  return readBundle(product.productDetails) !== null;
}

/** productDetails with the bundle's items set (the seller's other details kept). */
export function bundleDetails(existing: unknown, items: BundleItem[]): Record<string, unknown> {
  return { ...record(existing), bundle: { items: items.map((item) => cleanItem(item.productId, item.variantId, item.quantity)) } };
}

/**
 * The product form saves productDetails as string details only (shared/product-types.ts readProductDetails), which
 * would drop the bundle: this puts the saved bundle back on what the form sends.
 */
export function keepBundle(stored: unknown, next: Record<string, string>): Record<string, unknown> {
  const items = readBundle(stored);
  return items ? bundleDetails(next, items) : next;
}

/** Two lines of the same product and version become one (quantities added); different versions stay apart. */
export function mergeBundleItems(items: BundleItemInput[]): BundleItem[] {
  const out = new Map<string, BundleItem>();
  for (const item of items) {
    if (!item.productId) continue;
    const quantity = Math.floor(Number(item.quantity) || 0);
    const key = bundleItemKey(item);
    const entry = out.get(key);
    if (entry) entry.quantity += quantity;
    else out.set(key, cleanItem(item.productId, item.variantId, quantity));
  }
  return [...out.values()];
}

// ─── Sizes and options ────────────────────────────────────────────────────────

/**
 * The version an item takes from its product: null when the product has no versions (a variantId left from versions
 * removed since is ignored), undefined when it can't be bought (the version is gone or switched off, or none was
 * named and the product has more than one). Same rule as a bag line (shared/product-variants.ts resolveLineVariant).
 */
export function itemVariant(part: { variants?: unknown }, variantId?: string | null): ProductVariant | null | undefined {
  if (!normalizeVariants(part.variants).length) return null;
  const choice = resolveLineVariant({ retailPrice: 0, variants: part.variants }, { variantId: variantId || null });
  return choice.ok ? choice.variant : undefined;
}

/** What one unit of the item costs bought alone: its version's own price when it has one, else the product's. */
export function bundleItemPrice(part: { retailPrice: number; variants?: unknown }, item: { variantId?: string | null }) {
  return variantPrice(itemVariant(part, item.variantId) ?? null, part.retailPrice);
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
  /** The product's versions (sizes, colours…): an item of it names one (BundleItem.variantId). */
  variants?: unknown;
  preorderEnabled?: boolean | null;
}

export type BundleProblem = "name" | "price" | "too_few" | "too_many" | "quantity" | "missing" | "self" | "nested" | "dropship" | "versions" | "variant" | "preorder" | "archived";

export type BundleCheck = { ok: true; items: BundleItem[] } | { ok: false; problem: BundleProblem; product?: string };

/** Versions saved, but none switched on: the product can't be bought at all. */
function versionsAllOff(variants: unknown) {
  const versions = normalizeVariants(variants);
  return versions.length > 0 && !versions.some((variant) => variant.enabled);
}

/** Whether an item names a version its product sells: one of its switched-on versions, or none when it has none. */
export function itemVariantProblem(part: Pick<BundlePart, "variants">, variantId?: string | null): boolean {
  const versions = normalizeVariants(part.variants);
  if (!versions.length) return Boolean(variantId);
  const variant = variantId ? versions.find((entry) => entry.id === variantId) : undefined;
  return !variant || !variant.enabled;
}

/**
 * Whether a bundle can be saved: a name, a price above 0, 2 to 10 lines of this store's products (not archived; the
 * same product may be there twice with different versions), 1 to 20 of each, never a bundle inside a bundle (or the
 * bundle itself), only the seller's own products without preorders (a bundle sells from the seller's shelf: it can't
 * wait for a ship date or ship from a supplier), and a product with sizes or options names one of its switched-on
 * versions (one without names none).
 */
export function checkBundle(input: { storeId: string; name: string; price: number; items: BundleItemInput[]; selfId?: string | null }, parts: BundlePart[]): BundleCheck {
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
    if (itemVariantProblem(part, item.variantId)) return { ok: false, problem: "variant", product: part.name };
  }
  return { ok: true, items };
}

/** Why one of the store's products can't go in a bundle, or null when it can (the pickers list only these). */
export function partProblem(part: BundlePart): BundleProblem | null {
  if (part.status === "archived") return "archived";
  if (isBundleProduct(part)) return "nested";
  if (part.fulfillmentType === "dropship" || part.supplierProductId) return "dropship";
  if (versionsAllOff(part.variants)) return "versions";
  if (part.preorderEnabled) return "preorder";
  return null;
}

/** What the API answers for a problem (the web and phone forms show their own translated words first). */
export function bundleProblemMessage(problem: BundleProblem, product = "That product") {
  switch (problem) {
    case "name": return "Give the bundle a name.";
    case "price": return "Set a bundle price above 0.";
    case "too_few": return `Pick at least ${BUNDLE_MIN_ITEMS} different products (or sizes).`;
    case "too_many": return `A bundle can hold up to ${BUNDLE_MAX_ITEMS} products.`;
    case "quantity": return `Each product can be 1 to ${BUNDLE_MAX_QUANTITY} pieces.`;
    case "missing": return "One of those products is no longer in your store.";
    case "self": return "A bundle can't hold itself.";
    case "nested": return `${product} is a bundle already. Pick its products instead.`;
    case "dropship": return `${product} ships from a supplier, so it can't go in a bundle.`;
    case "versions": return `${product} has sizes or options, but none are switched on.`;
    case "variant": return `Pick one of the sizes or options ${product} sells.`;
    case "preorder": return `${product} is taking pre-orders, so it can't go in a bundle.`;
    case "archived": return `${product} is archived. Bring it back first.`;
  }
}

// ─── Price and saving ─────────────────────────────────────────────────────────

/** What the items cost bought one by one (their prices now: a version's own price when it has one, bundleItemPrice). */
export function partsTotal(items: BundleItem[], priceOf: (productId: string, item: BundleItem) => number | null | undefined) {
  const total = items.reduce((sum, item) => sum + (Number(priceOf(item.productId, item)) || 0) * item.quantity, 0);
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
  /** Its versions as saved (shared/product-variants.ts): a version counted on its own limits too. */
  variants?: unknown;
}

function forSale(part: PartStock | null | undefined): part is PartStock {
  return Boolean(part) && !(part!.status && part!.status !== "published") && !part!.preorderEnabled && part!.fulfillmentType !== "dropship";
}

const storeLeft = (part: PartStock) => Math.trunc(part.currentStock ?? 0) - Math.max(0, Math.trunc(part.reservedStock ?? 0));

/**
 * How many bundles one item allows: untracked stock never limits (null); tracked stock allows floor(left / quantity),
 * and a version counted on its own allows no more than floor(its stock / quantity) (a bundle never sells an item past
 * 0, even one that keeps selling when out); an item that isn't for sale (gone, unpublished, dropship, taking
 * pre-orders, or its version gone or switched off) allows none.
 */
export function partLimit(part: PartStock | null | undefined, quantity: number, variantId?: string | null): number | null {
  if (!forSale(part)) return 0;
  const variant = itemVariant(part, variantId);
  if (variant === undefined) return 0;
  if (part.trackStock === false) return null;
  const left = variant && variant.stock !== null ? Math.min(storeLeft(part), variant.stock) : storeLeft(part);
  return Math.max(0, Math.floor(left / Math.max(1, quantity)));
}

/**
 * Bundles that can be bought: the lowest over its items (null when no item tracks stock). Two versions of one
 * product share its stock, so their units add up against it; each counted version limits on its own too.
 */
export function bundleAvailable(items: BundleItem[], partOf: (productId: string) => PartStock | null | undefined): number | null {
  const perProduct = new Map<string, { part: PartStock; quantity: number }>();
  const perVariant = new Map<string, { stock: number; quantity: number }>();
  for (const item of items) {
    const part = partOf(item.productId);
    if (!forSale(part)) return 0;
    const variant = itemVariant(part, item.variantId);
    if (variant === undefined) return 0;
    if (part.trackStock === false) continue;
    const product = perProduct.get(item.productId) ?? { part, quantity: 0 };
    product.quantity += item.quantity;
    perProduct.set(item.productId, product);
    if (variant && variant.stock !== null) {
      const key = `${item.productId}::${variant.id}`;
      const entry = perVariant.get(key) ?? { stock: variant.stock, quantity: 0 };
      entry.quantity += item.quantity;
      perVariant.set(key, entry);
    }
  }
  let lowest: number | null = null;
  const limit = (left: number, quantity: number) => {
    const count = Math.max(0, Math.floor(left / Math.max(1, quantity)));
    lowest = lowest === null ? count : Math.min(lowest, count);
  };
  for (const { part, quantity } of perProduct.values()) limit(storeLeft(part), quantity);
  for (const { stock, quantity } of perVariant.values()) limit(stock, quantity);
  return lowest;
}

/** A bundle's stock as shoppers' pages get it (shared/product-stock.ts ShopperStock): null when nothing limits it. */
export function bundleShopperStock(items: BundleItem[], partOf: (productId: string) => PartStock | null | undefined): ShopperStock | null {
  const left = bundleAvailable(items, partOf);
  return left === null ? null : { left, lowAt: DEFAULT_LOW_STOCK_AT, continueSelling: false };
}

/**
 * The units each item gives for a bag: `lines` is product id → quantity in the bag; bundles (bundle id → items) give
 * their items' units (quantity each × bundles) instead. Products bought on their own and inside a bundle add up
 * (two versions of one product add up on the product too).
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

/**
 * The units each version gives for the bundles in a bag: product id → version id → units (quantity × bundles), for
 * items whose product has versions (the version as checkout resolves it, itemVariant). Checkout adds these to the
 * same per-version stock holds as a size bought alone. Items whose version can't be bought are left out (checkout
 * refuses those bundles first).
 */
export function bundleVariantQuantities(lines: Map<string, number>, bundles: Map<string, BundleItem[]>, partOf: (productId: string) => { variants?: unknown } | null | undefined): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const [bundleId, count] of lines) {
    for (const item of bundles.get(bundleId) ?? []) {
      const part = partOf(item.productId);
      const variant = part ? itemVariant(part, item.variantId) : undefined;
      if (!variant) continue;
      const versions = out.get(item.productId) ?? new Map<string, number>();
      versions.set(variant.id, (versions.get(variant.id) ?? 0) + item.quantity * count);
      out.set(item.productId, versions);
    }
  }
  return out;
}

// ─── What shoppers see ────────────────────────────────────────────────────────

/** "What's inside" on a bundle's product page. */
export interface BundleSummary {
  /** id: the item's product (its page); variant: the version's name ("M / Red") when it has one. */
  items: Array<{ id: string; name: string; variant?: string; image: string | null; quantity: number; price: number }>;
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

/** An item's line in "What's inside" (and the seller's list): the version's name, price and photo when it has one. */
export function bundleItemView(row: { name: string; images?: string[] | null; retailPrice: number; variants?: unknown }, item: BundleItem) {
  const variant = itemVariant(row, item.variantId) ?? null;
  return {
    name: row.name,
    ...(variant ? { variant: variant.name } : {}),
    image: variant?.imageUrl ?? row.images?.[0] ?? null,
    price: variantPrice(variant, row.retailPrice),
  };
}

/** The bundle's "What's inside" and its stock, from its items' rows (items not found are left out of the list). */
export function bundleForShoppers(items: BundleItem[], price: number, rows: BundlePartRow[]): { summary: BundleSummary; stock: ShopperStock | null } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const list = items.flatMap((item) => {
    const row = byId.get(item.productId);
    if (!row) return [];
    const view = bundleItemView(row, item);
    return [{ id: row.id, name: view.name, ...(view.variant ? { variant: view.variant } : {}), image: view.image, quantity: item.quantity, price: view.price }];
  });
  const total = partsTotal(items, (id, item) => {
    const row = byId.get(id);
    return row ? bundleItemPrice(row, item) : 0;
  });
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

/**
 * What the web and phone forms say before saving (the server checks everything again). `needsVariant` says whether a
 * product has sizes or options (its line must then name one).
 */
export function bundleDraftProblem(draft: { name: string; price: number | null; items: BundleItemInput[] }, needsVariant?: (productId: string) => boolean): BundleProblem | null {
  if (!draft.name.trim()) return "name";
  if (needsVariant && draft.items.some((item) => needsVariant(item.productId) && !item.variantId)) return "variant";
  const items = mergeBundleItems(draft.items);
  if (items.length < BUNDLE_MIN_ITEMS) return "too_few";
  if (items.length > BUNDLE_MAX_ITEMS) return "too_many";
  if (items.some((item) => item.quantity < 1 || item.quantity > BUNDLE_MAX_QUANTITY)) return "quantity";
  if (draft.price === null || !Number.isFinite(draft.price) || draft.price <= 0) return "price";
  return null;
}
