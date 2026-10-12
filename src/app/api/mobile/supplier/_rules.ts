// What a supplier can do next with an order in the mobile app. Pure (no imports) so tests/mobile-partners.test.mjs
// can load it directly.
//
// Dropship orders are SupplierOrder rows (src/lib/supplier-orders): one per shop order and supplier, made once the
// shop's order is paid (or placed, for pay on delivery). The supplier accepts (pending → accepted) or declines,
// hands the parcel to the rider (→ shipped, the shop's order follows) and marks it delivered. Only their own lines
// are in it, so an order with other products too no longer blocks them.
// Wholesale orders (WholesaleOrder) go pending → confirmed (accept) → processing (packed) → shipped (handed over)
// → delivered, and a new one can be declined (→ cancelled).

export type SupplierOrderKind = "dropship" | "wholesale";
export type SupplierOrderAction = "accept" | "decline" | "packed" | "handed_over" | "delivered";

export function nextActions(kind: SupplierOrderKind, status: string): SupplierOrderAction[] {
  if (kind === "dropship") {
    if (status === "pending") return ["accept", "decline"];
    if (status === "accepted") return ["handed_over"];
    if (status === "shipped") return ["delivered"];
    return [];
  }
  if (status === "pending") return ["accept", "decline"];
  if (status === "confirmed") return ["packed", "handed_over"];
  if (status === "processing") return ["handed_over"];
  if (status === "shipped") return ["delivered"];
  return [];
}

/** The status an action moves the order to, or null when it can't from here. */
export function statusAfter(kind: SupplierOrderKind, status: string, action: SupplierOrderAction): string | null {
  if (!nextActions(kind, status).includes(action)) return null;
  if (action === "handed_over") return "shipped";
  if (action === "delivered") return "delivered";
  if (kind === "dropship") return action === "accept" ? "accepted" : "rejected";
  if (action === "decline") return "cancelled";
  return action === "accept" ? "confirmed" : "processing";
}

/** The portal action (src/lib/supplier-orders) an app action is; "packed" is wholesale-only and has none. */
export function portalAction(action: SupplierOrderAction): "accept" | "reject" | "ship" | "deliver" | null {
  return ({ accept: "accept", decline: "reject", handed_over: "ship", delivered: "deliver", packed: null } as const)[action];
}

/** Waiting on the supplier: to accept or to send. */
export function needsSupplier(kind: SupplierOrderKind, status: string) {
  return nextActions(kind, status).some((action) => action !== "delivered");
}

/** Dropship statuses still to do (open) and finished (done). */
export const DROPSHIP_OPEN = ["pending", "accepted"] as const;
export const DROPSHIP_DONE = ["shipped", "delivered", "rejected", "cancelled", "expired"] as const;

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
