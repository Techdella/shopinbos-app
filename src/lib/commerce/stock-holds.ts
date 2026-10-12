// Stock an order takes at checkout, and when an unpaid order gives it back. Pure (no imports) so
// tests/supplier-orders.test.mjs can load it directly.
//
// A store product sold from the seller's own shelf takes the store's stock (StoreProduct.currentStock). A product
// the seller dropships takes the supplier's stock (SupplierProduct.stockQuantity): the seller holds none of it.
// The order keeps the list (RetailOrder.stockHold) so expiry gives back exactly what was taken.

export type StockHold =
  | { source: "store"; productId: string; quantity: number; name: string }
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

/** One hold per store product, from the quantities in the bag. */
export function buildStockHolds(products: StockProduct[], quantities: Map<string, number>): StockHold[] {
  return products.flatMap((product): StockHold[] => {
    const quantity = quantities.get(product.id) ?? 0;
    if (quantity <= 0) return [];
    if (isDropshipProduct(product)) {
      return [{ source: "supplier", productId: product.id, supplierProductId: product.supplierProduct!.id, quantity, name: product.name }];
    }
    return [{ source: "store", productId: product.id, quantity, name: product.name }];
  });
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
    if (hold.source === "store") return [{ source: "store", productId, quantity, name }];
    return [];
  });
}

// ─── Unpaid order expiry ──────────────────────────────────────────────────────

export const DEFAULT_UNPAID_ORDER_TTL_MINUTES = 30;

/** Minutes an unpaid card/transfer order holds stock (env UNPAID_ORDER_TTL_MINUTES, default 30, at least 5). */
export function unpaidOrderTtlMinutes(raw: string | undefined | null = undefined) {
  const minutes = Math.floor(Number(raw));
  if (!raw || !Number.isFinite(minutes) || minutes <= 0) return DEFAULT_UNPAID_ORDER_TTL_MINUTES;
  return Math.max(5, Math.min(minutes, 7 * 24 * 60));
}

export const UNPAID_STATUSES = ["pending", "awaiting_payment"] as const;
/** Payment methods that expire: Paystack (saved as null or "paystack") and bank transfer. Never pay on delivery. */
export const EXPIRING_METHODS = ["paystack", "transfer"] as const;

export function expiryCutoff(now: Date, ttlMinutes: number) {
  return new Date(now.getTime() - ttlMinutes * 60_000);
}

export interface ExpiryCandidate {
  status: string;
  paymentMethod: string | null;
  createdAt: Date;
  stockHold: unknown;
  stockReleasedAt?: Date | null;
}

/** An unpaid card or transfer order past its time that still holds stock. Paid and pay-on-delivery orders never expire. */
export function isExpirableOrder(order: ExpiryCandidate, now: Date, ttlMinutes: number) {
  if (!(UNPAID_STATUSES as readonly string[]).includes(order.status)) return false;
  const method = order.paymentMethod ?? "paystack";
  if (!(EXPIRING_METHODS as readonly string[]).includes(method)) return false;
  if (order.stockReleasedAt) return false;
  if (parseStockHold(order.stockHold).length === 0) return false;
  return order.createdAt.getTime() <= expiryCutoff(now, ttlMinutes).getTime();
}

/** A store order as the buyer's browser gets it: without the stock bookkeeping (it names supplier products). */
export function shopperOrder<T extends { stockHold?: unknown; stockReleasedAt?: unknown; paymentIssue?: unknown }>(order: T) {
  const { stockHold: _hold, stockReleasedAt: _released, paymentIssue: _issue, ...rest } = order;
  void _hold;
  void _released;
  void _issue;
  return rest;
}
