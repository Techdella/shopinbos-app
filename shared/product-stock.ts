// Stock tracking for a store product, as the seller sets it on the product form ("Track stock"). Pure (no imports),
// shared by the storefront (product page, cards, cart) and the server that shapes products for shoppers.
// Checkout's own rules (what it takes and refuses) live in src/lib/commerce/stock-holds.ts.
//
//   trackStock false  → never sold out; the count (if any, and any per-version counts) is ignored.
//   trackStock true   → shoppers can buy up to currentStock - reservedStock; versions with their own count use it.
//                       At 0 the product is sold out, unless continueSellingWhenOut (backorders).
//   Dropship products always sell the supplier's stock instead (SupplierProduct.stockQuantity).

export interface StockSettings {
  trackStock?: boolean | null;
  continueSellingWhenOut?: boolean | null;
  currentStock?: number | null;
  reservedStock?: number | null;
  lowStockThreshold?: number | null;
}

/** A tracked product's stock as shoppers' pages get it (never the raw counts). Null/absent: not tracked. */
export interface ShopperStock {
  /** Units shoppers can still buy (0 when sold out or oversold). */
  left: number;
  /** "Only N left" shows at or below this. */
  lowAt: number;
  /** Keeps selling at 0. */
  continueSelling: boolean;
}

/** When the seller left the low-stock level empty or at 0. */
export const DEFAULT_LOW_STOCK_AT = 5;

function whole(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

export function lowStockAt(threshold: number | null | undefined) {
  return typeof threshold === "number" && Number.isFinite(threshold) && threshold > 0 ? Math.floor(threshold) : DEFAULT_LOW_STOCK_AT;
}

/** In stock minus what the seller set aside (reservedStock). Can be below 0 after backorders. */
export function availableStock(product: Pick<StockSettings, "currentStock" | "reservedStock">) {
  return whole(product.currentStock) - Math.max(0, whole(product.reservedStock));
}

export function shopperStock(product: StockSettings): ShopperStock | null {
  if (!product.trackStock) return null;
  return { left: Math.max(0, availableStock(product)), lowAt: lowStockAt(product.lowStockThreshold), continueSelling: Boolean(product.continueSellingWhenOut) };
}

/**
 * The versions JSON as shoppers get it: each version's own count only matters when the product's stock is tracked,
 * so an untracked product's versions lose theirs (and never show as sold out).
 */
export function variantsForSale(variants: unknown, tracked: boolean): unknown {
  if (tracked || !Array.isArray(variants)) return variants;
  return variants.map((row) => (row && typeof row === "object" && !Array.isArray(row) && "stock" in row ? { ...(row as Record<string, unknown>), stock: null } : row));
}

export interface Availability {
  /** "untracked": nothing to say about stock. */
  tone: "in" | "low" | "out" | "untracked";
  /** What the buy box says, or null. */
  text: string | null;
  canBuy: boolean;
  /** The most one bag line may hold; null when there is no limit. */
  maxQuantity: number | null;
}

/**
 * Whether the chosen product (or version) can be bought, and the stock line. `versionSoldOut`: the chosen version is
 * switched off or its own count is 0 (useVariantPicker). `variantStock`: the chosen version's own count, when it has
 * one. `supplierStock`: the supplier's stock for dropship products. `stock`: the product's tracked stock.
 */
export function stockAvailability(input: { versionSoldOut?: boolean; variantStock?: number | null; supplierStock?: number | null; stock?: ShopperStock | null }): Availability {
  const out: Availability = { tone: "out", text: "Sold out", canBuy: false, maxQuantity: 0 };
  const backorder = Boolean(input.stock?.continueSelling) && typeof input.supplierStock !== "number";
  if (input.versionSoldOut && !(backorder && input.variantStock === 0)) return out;
  let left: number;
  let lowAt = DEFAULT_LOW_STOCK_AT;
  if (typeof input.supplierStock === "number") {
    left = input.supplierStock;
  } else if (input.stock) {
    left = typeof input.variantStock === "number" ? input.variantStock : input.stock.left;
    lowAt = input.stock.lowAt;
  } else if (typeof input.variantStock === "number") {
    // A version counted on its own (older data or the builder preview).
    left = input.variantStock;
  } else {
    return { tone: "untracked", text: null, canBuy: true, maxQuantity: null };
  }
  left = Math.max(0, Math.floor(left));
  if (backorder) return left > 0 && left <= lowAt ? { tone: "low", text: `Only ${left} left`, canBuy: true, maxQuantity: null } : { tone: "in", text: left > 0 ? "In stock" : null, canBuy: true, maxQuantity: null };
  if (left <= 0) return out;
  if (left <= lowAt) return { tone: "low", text: `Only ${left} left`, canBuy: true, maxQuantity: left };
  return { tone: "in", text: "In stock", canBuy: true, maxQuantity: left };
}

/** A product card's "Sold out" badge: tracked stock (or the supplier's) at 0 with no backorders. */
export function listingSoldOut(product: { stock?: ShopperStock | null; supplierProduct?: { stockQuantity?: number | null } | null }) {
  const supplier = product.supplierProduct?.stockQuantity;
  if (typeof supplier === "number") return supplier <= 0;
  return Boolean(product.stock && !product.stock.continueSelling && product.stock.left <= 0);
}

/**
 * The trackStock value to save, or undefined to leave it. The seller's own choice wins. Without one (the phone,
 * onboarding, Peggy, older clients), giving a count above 0 switches tracking on: whoever typed a count meant it to
 * be counted. A new product is also tracked when its versions carry their own counts. A count of 0 never switches
 * tracking on or off by itself.
 */
export function stockTrackingFor(sent: { trackStock?: boolean | null; currentStock?: number | null; variantsCounted?: boolean }, stored?: { trackStock: boolean } | null): boolean | undefined {
  if (typeof sent.trackStock === "boolean") return sent.trackStock;
  const counted = (typeof sent.currentStock === "number" && sent.currentStock > 0) || Boolean(sent.variantsCounted);
  if (!stored) return counted;
  return counted && !stored.trackStock ? true : undefined;
}

type SupplierStockRef = { stockQuantity?: number | null };

interface ShopperShapeInput extends StockSettings {
  fulfillmentType?: string | null;
  variants?: unknown;
  supplierProduct?: SupplierStockRef | null;
}

/**
 * A product row ready for shoppers' pages: `stock` (tracked stock, else null), version counts only where they apply,
 * and the supplier's stock only for dropship products (others sell from the store's own stock). The raw counts and
 * switches are left out. Dropship needs `fulfillmentType` in the row.
 */
export function forShoppers<T extends ShopperShapeInput>(product: T): Omit<T, "trackStock" | "continueSellingWhenOut" | "currentStock" | "reservedStock"> & { stock: ShopperStock | null } {
  const { trackStock: _track, continueSellingWhenOut: _continue, currentStock: _current, reservedStock: _reserved, ...rest } = product;
  void _track;
  void _continue;
  void _current;
  void _reserved;
  const dropship = product.fulfillmentType === "dropship" && Boolean(product.supplierProduct);
  const tracked = !dropship && Boolean(product.trackStock);
  return {
    ...rest,
    ...("variants" in product ? { variants: variantsForSale(product.variants, tracked) } : {}),
    ...(product.supplierProduct && !dropship ? { supplierProduct: { ...product.supplierProduct, stockQuantity: null } } : {}),
    stock: dropship ? null : shopperStock(product),
  };
}
