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

// ─── Wholesale: stock ─────────────────────────────────────────────────────────

/**
 * Supplier stock a wholesale order takes when placed. A product with stock on record reserves the quantity (the
 * order is refused if there isn't enough); one with none on record (0, made to order) reserves nothing.
 */
export function wholesaleReservation(stockQuantity: number, quantity: number): { reserve: number } | { short: true } {
  if (stockQuantity <= 0) return { reserve: 0 };
  if (quantity > stockQuantity) return { short: true };
  return { reserve: quantity };
}

/** Declined or cancelled wholesale orders give their reserved stock back; shipping or delivering never does. */
export function wholesaleReleasesStock(status: string) {
  return status === "cancelled";
}

/** A seller can cancel a wholesale order until the supplier starts packing it. */
export const SELLER_CANCELLABLE_WHOLESALE = ["pending", "confirmed"] as const;

export function sellerCanCancelWholesale(status: string) {
  return (SELLER_CANCELLABLE_WHOLESALE as readonly string[]).includes(status);
}

/** rejectReason prefix when the seller cancelled (otherwise a cancelled order was declined by the supplier). */
export const SELLER_CANCEL_PREFIX = "Cancelled by the seller";

/** What the seller sees for a wholesale order: the stage, and why it ended if it was declined or cancelled. */
export function sellerWholesaleStage(status: string, rejectReason: string | null | undefined): { label: string; tone: "warning" | "info" | "accent" | "success" | "danger" | "muted"; note: string | null } {
  if (status === "cancelled") {
    const reason = (rejectReason ?? "").trim();
    if (reason.startsWith(SELLER_CANCEL_PREFIX)) {
      const said = reason.slice(SELLER_CANCEL_PREFIX.length).replace(/^[:.]\s*/, "").trim();
      return { label: "Cancelled by you", tone: "muted", note: said ? `Your reason: ${said}` : null };
    }
    return { label: "Declined by the supplier", tone: "danger", note: reason ? `Declined: ${reason}` : null };
  }
  const stages: Record<string, { label: string; tone: "warning" | "info" | "accent" | "success" | "danger" | "muted" }> = {
    pending: { label: "Waiting for the supplier", tone: "warning" },
    confirmed: { label: "Confirmed: expect their invoice", tone: "info" },
    processing: { label: "Being packed", tone: "accent" },
    shipped: { label: "On the way", tone: "accent" },
    delivered: { label: "Delivered", tone: "success" },
    refunded: { label: "Refunded", tone: "muted" },
  };
  return { ...(stages[status] ?? { label: status, tone: "muted" as const }), note: null };
}

// ─── Supplier money: earned, owed, paid ───────────────────────────────────────

/** Orders a supplier has earned on: shipped or delivered (wholesale and dropship alike). */
export const SUPPLIER_EARNED_STATUSES = ["shipped", "delivered"] as const;

export interface SupplierMoneyRow {
  status: string;
  amount: number;
  paidOutAt?: Date | string | null;
}

/** Earned (shipped or delivered), of which paid (the supplier confirmed it) and owed (not yet). */
export function supplierMoney(rows: SupplierMoneyRow[]) {
  const round = (value: number) => Math.round(value * 100) / 100;
  let earned = 0;
  let paid = 0;
  let earnedCount = 0;
  let paidCount = 0;
  for (const row of rows) {
    if (!(SUPPLIER_EARNED_STATUSES as readonly string[]).includes(row.status)) continue;
    const amount = Number(row.amount) || 0;
    earned += amount;
    earnedCount += 1;
    if (row.paidOutAt) {
      paid += amount;
      paidCount += 1;
    }
  }
  return { earned: round(earned), paid: round(paid), owed: round(earned - paid), earnedCount, paidCount, owedCount: earnedCount - paidCount };
}

/** Wholesale orders still to send (OrderStatus) and dropship orders still to send (SupplierOrder.status). */
export const WHOLESALE_TO_SHIP = ["pending", "confirmed", "processing"] as const;
export const DROPSHIP_TO_SHIP = ["pending", "accepted"] as const;
