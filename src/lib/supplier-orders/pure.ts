// Orders suppliers receive: dropship orders (SupplierOrder, one per seller store order and supplier) and wholesale
// orders (WholesaleOrder, a seller buying stock). The rules for creating and moving them. Pure (no imports) so
// tests/supplier-orders.test.mjs can load it directly.

// ─── Dropship: creating ───────────────────────────────────────────────────────

export const SUPPLIER_ORDER_STATUSES = ["pending", "accepted", "shipped", "delivered", "rejected", "cancelled"] as const;
export type SupplierOrderStatus = (typeof SUPPLIER_ORDER_STATUSES)[number];

/** One supplier order per store order and supplier: replaying a payment webhook can't make a second one. */
export function supplierOrderKey(retailOrderId: string, supplierId: string) {
  return `dropship:${retailOrderId}:${supplierId}`;
}

/** Store order statuses that mean "paid": the supplier can ship. */
export const PAID_RETAIL_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;

/** A store order is sent to its suppliers once paid, or once placed when the buyer pays on delivery. */
export function readyForSuppliers(order: { status: string; paymentMethod: string | null }) {
  if ((PAID_RETAIL_STATUSES as readonly string[]).includes(order.status)) return true;
  return order.paymentMethod === "pay_on_delivery" && ["pending", "awaiting_payment"].includes(order.status);
}

export interface OrderLine {
  productId?: unknown;
  name?: unknown;
  variant?: unknown;
  quantity?: unknown;
  image?: unknown;
}

export interface DropshipLink {
  supplierId: string;
  supplierProductId: string;
  unitCost: number;
  image?: string | null;
}

export interface SupplierOrderLine {
  storeProductId: string;
  supplierProductId: string;
  name: string;
  variant: string | null;
  quantity: number;
  unitCost: number;
  image: string | null;
}

export interface SupplierOrderGroup {
  supplierId: string;
  items: SupplierOrderLine[];
  costTotal: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The store order's dropship lines, grouped per supplier (in the order suppliers first appear). Lines for the
 * seller's own products are left out; `sellerLines` says whether there were any.
 */
export function groupDropshipLines(items: unknown, links: Map<string, DropshipLink>): { groups: SupplierOrderGroup[]; sellerLines: number } {
  const list = Array.isArray(items) ? (items as OrderLine[]) : [];
  const groups = new Map<string, SupplierOrderGroup>();
  let sellerLines = 0;
  for (const item of list) {
    const productId = typeof item?.productId === "string" ? item.productId : "";
    const link = productId ? links.get(productId) : undefined;
    if (!link) {
      sellerLines += 1;
      continue;
    }
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const group = groups.get(link.supplierId) ?? { supplierId: link.supplierId, items: [], costTotal: 0 };
    group.items.push({
      storeProductId: productId,
      supplierProductId: link.supplierProductId,
      name: typeof item.name === "string" && item.name ? item.name : "Product",
      variant: typeof item.variant === "string" && item.variant ? item.variant : null,
      quantity,
      unitCost: link.unitCost,
      image: (typeof item.image === "string" && item.image) || link.image || null,
    });
    group.costTotal = round2(group.costTotal + link.unitCost * quantity);
    groups.set(link.supplierId, group);
  }
  return { groups: [...groups.values()], sellerLines };
}

// ─── Dropship: moving ─────────────────────────────────────────────────────────

export type SupplierAction = "accept" | "ship" | "deliver" | "reject";

/** What a supplier can do next with a dropship order. Shipping straight from "pending" accepts it too. */
export function supplierOrderActions(status: string): SupplierAction[] {
  if (status === "pending") return ["accept", "ship", "reject"];
  if (status === "accepted") return ["ship", "reject"];
  if (status === "shipped") return ["deliver"];
  return [];
}

export function supplierOrderStatusAfter(status: string, action: SupplierAction): SupplierOrderStatus | null {
  if (!supplierOrderActions(status).includes(action)) return null;
  return ({ accept: "accepted", ship: "shipped", deliver: "delivered", reject: "rejected" } as const)[action];
}

// ─── Wholesale: moving (WholesaleOrder.status is the OrderStatus enum) ────────

export function wholesaleActions(status: string): SupplierAction[] {
  if (status === "pending") return ["accept", "ship", "reject"];
  if (status === "confirmed" || status === "processing") return ["ship", "reject"];
  if (status === "shipped") return ["deliver"];
  return [];
}

export function wholesaleStatusAfter(status: string, action: SupplierAction): "confirmed" | "shipped" | "delivered" | "cancelled" | null {
  if (!wholesaleActions(status).includes(action)) return null;
  return ({ accept: "confirmed", ship: "shipped", deliver: "delivered", reject: "cancelled" } as const)[action];
}

// ─── The seller's store order follows its suppliers ───────────────────────────

const RETAIL_PROGRESS = ["pending", "awaiting_payment", "paid", "processing", "packed", "shipped", "delivered"];

/**
 * Where the seller's store order should move after a supplier update, or null to leave it. It only moves forward:
 * shipped once every supplier has shipped (and there's nothing the seller sends themselves), delivered once every
 * supplier has delivered, otherwise "processing" once a supplier is on it. A declined line leaves it to the seller.
 */
export function retailStatusAfterSupplierUpdate(input: { retailStatus: string; supplierStatuses: string[]; sellerLines: number }): "processing" | "shipped" | "delivered" | null {
  const current = RETAIL_PROGRESS.indexOf(input.retailStatus);
  if (current === -1 || input.supplierStatuses.length === 0) return null;
  const live = input.supplierStatuses.filter((status) => status !== "cancelled");
  if (live.length === 0) return null;
  const forward = (target: "processing" | "shipped" | "delivered") => (RETAIL_PROGRESS.indexOf(target) > current ? target : null);
  const anyRejected = live.includes("rejected");
  if (!anyRejected && input.sellerLines === 0) {
    if (live.every((status) => status === "delivered")) return forward("delivered");
    if (live.every((status) => status === "shipped" || status === "delivered")) return forward("shipped");
  }
  if (live.some((status) => status === "accepted" || status === "shipped" || status === "delivered")) {
    // Pay-on-delivery orders aren't paid yet; "processing" still says the parcel is being prepared.
    return forward("processing");
  }
  return null;
}

/** Shop names etc. go into notification emails as HTML; keep them plain. */
export function plainText(value: unknown, max = 120) {
  return String(value ?? "").replace(/[<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** "DS-1A2B3C": the short reference a supplier sees for a dropship order. */
export function supplierOrderRef(id: string) {
  return `DS-${id.slice(-6).toUpperCase()}`;
}
