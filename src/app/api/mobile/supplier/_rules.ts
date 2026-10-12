// What a supplier can do next with an order in the mobile app. Pure (no imports) so tests/mobile-partners.test.mjs
// can load it directly.
//
// Dropship orders are the seller's store orders (RetailOrder) with the supplier's products in them. The supplier
// accepts (paid → processing), packs (→ packed) and hands the parcel to the rider (→ shipped), but only when
// every line in the order is theirs: a mixed order is the seller's to move.
// Wholesale orders (WholesaleOrder) go pending → confirmed (accept) → processing (packed) → shipped (handed over),
// and a new one can be declined (→ cancelled).

export type SupplierOrderKind = "dropship" | "wholesale";
export type SupplierOrderAction = "accept" | "decline" | "packed" | "handed_over";

/** Store order statuses a supplier sees (unpaid orders only when they're pay on delivery). */
export const DROPSHIP_VISIBLE = ["paid", "processing", "packed", "shipped", "delivered"] as const;

export function dropshipVisible(order: { status: string; paymentMethod: string | null }) {
  return (DROPSHIP_VISIBLE as readonly string[]).includes(order.status) || (order.paymentMethod === "pay_on_delivery" && ["pending", "awaiting_payment"].includes(order.status));
}

export function nextActions(kind: SupplierOrderKind, status: string, options: { mixed?: boolean } = {}): SupplierOrderAction[] {
  if (kind === "dropship") {
    if (options.mixed) return [];
    if (["paid", "pending", "awaiting_payment"].includes(status)) return ["accept"];
    if (status === "processing") return ["packed"];
    if (status === "packed") return ["handed_over"];
    return [];
  }
  if (status === "pending") return ["accept", "decline"];
  if (status === "confirmed") return ["packed", "handed_over"];
  if (status === "processing") return ["handed_over"];
  return [];
}

/** The status an action moves the order to, or null when it can't from here. */
export function statusAfter(kind: SupplierOrderKind, status: string, action: SupplierOrderAction, options: { mixed?: boolean } = {}): string | null {
  if (!nextActions(kind, status, options).includes(action)) return null;
  if (action === "decline") return "cancelled";
  if (action === "handed_over") return "shipped";
  if (kind === "dropship") return action === "accept" ? "processing" : "packed";
  return action === "accept" ? "confirmed" : "processing";
}

/** Waiting on the supplier: to accept or to pack. */
export function needsSupplier(kind: SupplierOrderKind, status: string, options: { mixed?: boolean } = {}) {
  return nextActions(kind, status, options).length > 0;
}

/** The supplier's lines in a store order: items whose store product dropships one of theirs. */
export function supplierLines<T extends { productId?: unknown; quantity?: unknown }>(items: unknown, storeProductIds: Set<string>) {
  const list = Array.isArray(items) ? (items as T[]) : [];
  const mine = list.filter((item) => typeof item?.productId === "string" && storeProductIds.has(item.productId));
  return { mine, mixed: mine.length > 0 && mine.length < list.length };
}

export const LOW_STOCK = 5;

export function isLowStock(product: { stockQuantity: number; status: string }) {
  return product.status !== "unpublished" && product.status !== "rejected" && product.stockQuantity <= LOW_STOCK;
}

/** The quote reply text the seller reads: the supplier's note plus the minimum order, when one is set. */
export function quoteReplyText(note: string | null | undefined, moq: number | null | undefined) {
  const parts = [note?.trim() || ""];
  if (moq && moq > 1) parts.push(`Minimum order: ${Math.floor(moq)} units.`);
  return parts.filter(Boolean).join("\n").slice(0, 1000) || undefined;
}
