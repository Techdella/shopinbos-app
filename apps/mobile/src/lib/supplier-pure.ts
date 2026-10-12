// Supplier app words and order groups (build spec 8A, "Suppliers, delivery companies and riders get the same
// rules"). Pure, so the root tests can load it. Suppliers never see "dropship", "white label", "escrow" or "quote":
// shops sell it for you, the shop's label, the shop pays first and we keep the money safe, tell them your price.

export type SupplierOrderGroup = "new" | "pack" | "sent";

interface OrderLike {
  status: string;
  next: readonly string[];
}

/** New = waiting for you to say yes. To pack = accepted, not yet with the rider. Sent = with the rider or finished. */
export function supplierOrderGroup(order: OrderLike): SupplierOrderGroup {
  if (order.next.includes("accept")) return "new";
  if (order.next.includes("packed") || order.next.includes("handed_over")) return "pack";
  return "sent";
}

/** "Shops sell it for you" (the old dropship orders) or "Bulk order" (the old wholesale orders). */
export const ORDER_KIND_LABEL = { dropship: "A shop sold it for you", wholesale: "Bulk order" } as const;

/** Where a single order is, in the supplier's words. */
export const SUPPLIER_ORDER_STAGE: Record<string, string> = {
  pending: "New. The shop is waiting",
  awaiting_payment: "New. Customer pays when it arrives",
  paid: "New. The shop is waiting",
  confirmed: "Accepted. Pack it",
  accepted: "Accepted. Pack it",
  processing: "Packed. Waiting for the rider",
  packed: "Packed. Waiting for the rider",
  shipped: "With the rider",
  delivered: "Delivered",
  rejected: "You said no",
  cancelled: "Cancelled",
  refunded: "Money given back",
  returned: "Sent back",
};

export function supplierOrderStage(status: string) {
  return SUPPLIER_ORDER_STAGE[status] ?? status.replace(/_/g, " ");
}

/** A bulk request's status, in the supplier's words. */
export const BULK_REQUEST_STAGE: Record<string, string> = {
  pending: "Tell them your price",
  responded: "Price sent",
  accepted: "The shop said yes",
  rejected: "Said no",
  expired: "Ran out of time",
};

export function bulkRequestStage(status: string) {
  return BULK_REQUEST_STAGE[status] ?? status;
}

/** "When can it be ready?" choices. The answer goes to the shop with the price. */
export const READY_CHOICES = [
  { key: "today", label: "Today", text: "It can be ready today." },
  { key: "3days", label: "In 3 days", text: "It can be ready in 3 days." },
  { key: "week", label: "In a week", text: "It can be ready in a week." },
  { key: "2weeks", label: "In 2 weeks", text: "It can be ready in 2 weeks." },
] as const;

/** "50 pairs", "1 piece", "12 pieces". */
export function countWord(quantity: number) {
  return `${quantity.toLocaleString("en-NG")} ${quantity === 1 ? "piece" : "pieces"}`;
}

/** How long the shop has been waiting for an answer: "Waiting 5 minutes", "Waiting 3 hours", "Waiting 2 days". */
export function waitingLabel(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 2) return "Just came in";
  if (minutes < 60) return `Waiting ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Waiting ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `Waiting ${days} day${days === 1 ? "" : "s"}`;
}
