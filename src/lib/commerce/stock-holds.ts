// Stock an order takes at checkout, and when an unpaid order gives it back. Pure (no imports) so
// tests/supplier-orders.test.mjs can load it directly.
//
// A store product sold from the seller's own shelf takes the store's stock (StoreProduct.currentStock). A product
// the seller dropships takes the supplier's stock (SupplierProduct.stockQuantity): the seller holds none of it.
// The order keeps the list (RetailOrder.stockHold) so expiry gives back exactly what was taken.

/** Units taken from one version of a product when its stock is counted per version (shared/product-variants.ts). */
export interface VariantHold {
  id: string;
  quantity: number;
  name: string;
}

export type StockHold =
  | { source: "store"; productId: string; quantity: number; name: string; variants?: VariantHold[] }
  | { source: "supplier"; productId: string; supplierProductId: string; quantity: number; name: string };

export interface StockProduct {
  id: string;
  name: string;
  currentStock: number | null;
  fulfillmentType?: string | null;
  supplierProductId?: string | null;
  supplierProduct?: { id: string; stockQuantity: number; status: string } | null;
}

/** Dropship: linked to a supplier product and fulfilled by the supplier, so the supplier's stock counts. */
export function isDropshipProduct(product: Pick<StockProduct, "fulfillmentType" | "supplierProductId" | "supplierProduct">) {
  return product.fulfillmentType === "dropship" && Boolean(product.supplierProductId) && Boolean(product.supplierProduct);
}

/**
 * One hold per store product, from the quantities in the bag. `variantQuantities` (product id → versions) names the
 * versions whose stock is counted per version; the store's own stock then also takes from those versions.
 */
export function buildStockHolds(products: StockProduct[], quantities: Map<string, number>, variantQuantities?: Map<string, VariantHold[]>): StockHold[] {
  return products.flatMap((product): StockHold[] => {
    const quantity = quantities.get(product.id) ?? 0;
    if (quantity <= 0) return [];
    if (isDropshipProduct(product)) {
      return [{ source: "supplier", productId: product.id, supplierProductId: product.supplierProduct!.id, quantity, name: product.name }];
    }
    const variants = variantQuantities?.get(product.id)?.filter((hold) => hold.quantity > 0);
    return [{ source: "store", productId: product.id, quantity, name: product.name, ...(variants?.length ? { variants } : {}) }];
  });
}

/** Versions to take stock from, per product, summed across holds (two holds can name the same version). */
export function variantHoldTotals(holds: StockHold[]) {
  const out = new Map<string, Map<string, VariantHold>>();
  for (const hold of holds) {
    if (hold.source !== "store" || !hold.variants?.length) continue;
    const map = out.get(hold.productId) ?? new Map<string, VariantHold>();
    for (const variant of hold.variants) {
      const entry = map.get(variant.id);
      if (entry) entry.quantity += variant.quantity;
      else map.set(variant.id, { ...variant });
    }
    out.set(hold.productId, map);
  }
  return out;
}

/** Units each stock pool must give: store products by id, supplier products by id (two lines can share one). */
export function holdTotals(holds: StockHold[]) {
  const store = new Map<string, { quantity: number; names: string[] }>();
  const supplier = new Map<string, { quantity: number; names: string[] }>();
  for (const hold of holds) {
    const map = hold.source === "supplier" ? supplier : store;
    const key = hold.source === "supplier" ? hold.supplierProductId : hold.productId;
    const entry = map.get(key) ?? { quantity: 0, names: [] };
    entry.quantity += hold.quantity;
    if (!entry.names.includes(hold.name)) entry.names.push(hold.name);
    map.set(key, entry);
  }
  return { store, supplier };
}

/** Names of the products there isn't enough stock for (an unpublished supplier product has none to sell). */
export function stockShortfalls(products: StockProduct[], quantities: Map<string, number>): string[] {
  const holds = buildStockHolds(products, quantities);
  const totals = holdTotals(holds);
  const byId = new Map(products.map((product) => [product.id, product]));
  const short: string[] = [];
  for (const [productId, { quantity, names }] of totals.store) {
    if ((byId.get(productId)?.currentStock ?? 0) < quantity) short.push(...names);
  }
  for (const [supplierProductId, { quantity, names }] of totals.supplier) {
    const supplierProduct = products.find((product) => product.supplierProduct?.id === supplierProductId)?.supplierProduct;
    const available = supplierProduct && supplierProduct.status === "published" ? supplierProduct.stockQuantity : 0;
    if (available < quantity) short.push(...names);
  }
  return [...new Set(short)];
}

/** RetailOrder.stockHold as saved, ignoring anything malformed. */
export function parseStockHold(value: unknown): StockHold[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): StockHold[] => {
    if (!raw || typeof raw !== "object") return [];
    const hold = raw as Record<string, unknown>;
    const quantity = Math.floor(Number(hold.quantity));
    const productId = typeof hold.productId === "string" ? hold.productId : "";
    const name = typeof hold.name === "string" ? hold.name : "Product";
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) return [];
    if (hold.source === "supplier" && typeof hold.supplierProductId === "string" && hold.supplierProductId) {
      return [{ source: "supplier", productId, supplierProductId: hold.supplierProductId, quantity, name }];
    }
    if (hold.source === "store") {
      const variants = Array.isArray(hold.variants)
        ? hold.variants.flatMap((raw): VariantHold[] => {
            if (!raw || typeof raw !== "object") return [];
            const entry = raw as Record<string, unknown>;
            const count = Math.floor(Number(entry.quantity));
            if (typeof entry.id !== "string" || !entry.id || !Number.isFinite(count) || count <= 0) return [];
            return [{ id: entry.id, quantity: count, name: typeof entry.name === "string" ? entry.name : "Option" }];
          })
        : [];
      return [{ source: "store", productId, quantity, name, ...(variants.length ? { variants } : {}) }];
    }
    return [];
  });
}

// ─── Unpaid order expiry ──────────────────────────────────────────────────────

export const DEFAULT_UNPAID_ORDER_TTL_MINUTES = 30;
export const DEFAULT_UNPAID_TRANSFER_TTL_HOURS = 24;
/** The longest any unpaid order can hold stock: a week. */
export const MAX_UNPAID_TTL_HOURS = 7 * 24;

/** Minutes an unpaid card order holds stock (env UNPAID_ORDER_TTL_MINUTES, default 30, at least 5). */
export function unpaidOrderTtlMinutes(raw: string | undefined | null = undefined) {
  const minutes = Math.floor(Number(raw));
  if (!raw || !Number.isFinite(minutes) || minutes <= 0) return DEFAULT_UNPAID_ORDER_TTL_MINUTES;
  return Math.max(5, Math.min(minutes, MAX_UNPAID_TTL_HOURS * 60));
}

/** Hours an unpaid bank-transfer order holds stock (env UNPAID_TRANSFER_TTL_HOURS, default 24, 1 to 168). */
export function unpaidTransferTtlHours(raw: string | number | undefined | null = undefined) {
  const hours = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(hours) || hours <= 0) return DEFAULT_UNPAID_TRANSFER_TTL_HOURS;
  return Math.max(1, Math.min(Math.round(hours), MAX_UNPAID_TTL_HOURS));
}

export const UNPAID_STATUSES = ["pending", "awaiting_payment"] as const;
/** Card checkout through Paystack (saved as null or "paystack"): the short window. */
export const CARD_METHODS = ["paystack"] as const;
/** Ways to pay the buyer does by hand, outside Paystack, that still expire: the long window. Never pay on delivery. */
export const OFFLINE_EXPIRING_METHODS = ["transfer"] as const;
/** Payment methods that expire: Paystack (saved as null or "paystack") and bank transfer. Never pay on delivery. */
export const EXPIRING_METHODS = [...CARD_METHODS, ...OFFLINE_EXPIRING_METHODS] as const;

export interface PaymentWindows {
  /** Card (Paystack) orders. */
  cardMinutes: number;
  /** Bank transfer (and any other offline method that expires). */
  transferMinutes: number;
}

export function isCardMethod(method: string | null | undefined) {
  return !method || (CARD_METHODS as readonly string[]).includes(method);
}

/** Minutes an unpaid order paid this way holds its stock, or null when it never expires (pay on delivery, cash...). */
export function paymentWindowMinutes(method: string | null | undefined, windows: PaymentWindows): number | null {
  if (isCardMethod(method)) return windows.cardMinutes;
  if ((OFFLINE_EXPIRING_METHODS as readonly string[]).includes(method!)) return windows.transferMinutes;
  return null;
}

/** When an unpaid order placed at `createdAt` expires, or null when it never does. Saved on the order at checkout. */
export function paymentDueAt(createdAt: Date, method: string | null | undefined, windows: PaymentWindows): Date | null {
  const minutes = paymentWindowMinutes(method, windows);
  return minutes === null ? null : new Date(createdAt.getTime() + minutes * 60_000);
}

function asWindows(windows: number | PaymentWindows): PaymentWindows {
  return typeof windows === "number" ? { cardMinutes: windows, transferMinutes: DEFAULT_UNPAID_TRANSFER_TTL_HOURS * 60 } : windows;
}

/** The order's deadline: what checkout saved (paymentDueAt), else worked out from when it was placed. */
export function orderPaymentDeadline(order: { createdAt: Date; paymentMethod: string | null; paymentDueAt?: Date | null }, windows: number | PaymentWindows): Date | null {
  if (order.paymentDueAt) return order.paymentDueAt;
  return paymentDueAt(order.createdAt, order.paymentMethod, asWindows(windows));
}

/** "30 minutes", "24 hours", "2 days": a window in words for buyers and sellers. */
export function windowInWords(minutes: number) {
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours % 24 === 0 && hours >= 48) return `${hours / 24} days`;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function expiryCutoff(now: Date, ttlMinutes: number) {
  return new Date(now.getTime() - ttlMinutes * 60_000);
}

// ─── Orders placed before stock holds were saved ──────────────────────────────

interface LegacyOrderShape {
  stockHold: unknown;
  items?: unknown;
  channel?: string | null;
  logisticsDetails?: unknown;
  /** Checkout leaves it at "pending" (then "success"); a sale the seller records saves null. */
  paystackStatus?: string | null;
}

/**
 * Whether an order with no saved hold came through storefront checkout (which took stock) rather than a sale the
 * seller recorded by hand (src/lib/orders/record-sale.ts). Recorded sales never have a hold, save paystackStatus
 * as null, and the unpaid ones that could otherwise look expirable are "customer has it" sales (logisticsDetails
 * type "collected", no payment method) or in person. Checkout does none of these.
 */
export function isLegacyCheckoutOrder(order: LegacyOrderShape) {
  if (order.stockHold !== null && order.stockHold !== undefined) return false;
  if (order.paystackStatus === null) return false;
  if (order.channel === "in_person") return false;
  const details = order.logisticsDetails && typeof order.logisticsDetails === "object" ? (order.logisticsDetails as Record<string, unknown>) : {};
  return details.type !== "collected";
}

/**
 * What checkout took for an order placed before holds were saved. Back then it took the store's own stock
 * (StoreProduct.currentStock, soldStock up) for every line, dropship or not, summed per product.
 */
export function legacyStockHold(items: unknown): StockHold[] {
  const totals = new Map<string, StockHold & { source: "store" }>();
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId : "";
    const quantity = Math.floor(Number(item.quantity));
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;
    const entry = totals.get(productId);
    if (entry) entry.quantity += quantity;
    else totals.set(productId, { source: "store", productId, quantity, name: typeof item.name === "string" && item.name ? item.name : "Product" });
  }
  return [...totals.values()];
}

/** The stock an order holds: its saved hold, or for an older checkout order, what checkout took then. */
export function orderStockHolds(order: LegacyOrderShape): StockHold[] {
  if (order.stockHold !== null && order.stockHold !== undefined) return parseStockHold(order.stockHold);
  return isLegacyCheckoutOrder(order) ? legacyStockHold(order.items) : [];
}

export interface ExpiryCandidate extends LegacyOrderShape {
  status: string;
  paymentMethod: string | null;
  createdAt: Date;
  paymentDueAt?: Date | null;
  stockReleasedAt?: Date | null;
}

/**
 * An unpaid card or transfer order past its deadline that still holds stock. Paid and pay-on-delivery orders
 * never expire. `windows` is the card window in minutes, or both windows.
 */
export function isExpirableOrder(order: ExpiryCandidate, now: Date, windows: number | PaymentWindows) {
  if (!(UNPAID_STATUSES as readonly string[]).includes(order.status)) return false;
  const method = order.paymentMethod ?? "paystack";
  if (!(EXPIRING_METHODS as readonly string[]).includes(method)) return false;
  if (order.stockReleasedAt) return false;
  if (orderStockHolds(order).length === 0) return false;
  const deadline = orderPaymentDeadline(order, windows);
  return deadline !== null && deadline.getTime() <= now.getTime();
}

// ─── Discount codes ───────────────────────────────────────────────────────────

/**
 * Whether cancelling or expiring this order gives its discount use back: it used a code (or an automatic
 * discount, saved by its code), was never paid, and hasn't given it back already.
 */
export function shouldRestoreDiscount(order: { discountCode?: string | null; discountReleasedAt?: Date | null }, statusBefore: string) {
  if (!order.discountCode || order.discountReleasedAt) return false;
  return (UNPAID_STATUSES as readonly string[]).includes(statusBefore);
}

/** A store order as the buyer's browser gets it: without the stock bookkeeping (it names supplier products). */
export function shopperOrder<T extends { stockHold?: unknown; stockReleasedAt?: unknown; paymentIssue?: unknown; discountReleasedAt?: unknown; refundId?: unknown }>(order: T) {
  const { stockHold: _hold, stockReleasedAt: _released, paymentIssue: _issue, discountReleasedAt: _discount, refundId: _refund, ...rest } = order;
  void _hold;
  void _released;
  void _issue;
  void _discount;
  void _refund;
  return rest;
}
