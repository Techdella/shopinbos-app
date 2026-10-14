// Supplier app labels and order groups (build spec 8A, "Suppliers, delivery companies and riders get the same
// rules"). Standard commerce names (Dropship, Wholesale, Quote) with short, clear stage labels. Pure, so the root
// tests can load it.

export type SupplierOrderGroup = "new" | "pack" | "sent";

/**
 * The app-language translator (useT("m_supplier", …) on the phone). Optional: without it the words are English, so
 * the root tests get the same text. Keys live in shared/i18n/messages/m_supplier.
 */
export type Say = { dynamic(key: string, fallback?: string, vars?: Record<string, string | number | null | undefined>): string };

const say = (t: Say | undefined, key: string, english: string, vars?: Record<string, string | number>) =>
  t ? t.dynamic(key, english, vars) : english;

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

/** The two kinds of supplier order. */
export const ORDER_KIND_LABEL = { dropship: "Dropship", wholesale: "Wholesale" } as const;

export function orderKindLabel(kind: keyof typeof ORDER_KIND_LABEL, t?: Say) {
  return say(t, `kind.${kind}`, ORDER_KIND_LABEL[kind]);
}

/** Where a single order is, in the supplier's words. */
export const SUPPLIER_ORDER_STAGE: Record<string, string> = {
  pending: "New. The shop is waiting",
  awaiting_payment: "New. Pay on delivery",
  paid: "New. The shop is waiting",
  confirmed: "Accepted. Pack it",
  accepted: "Accepted. Pack it",
  processing: "Packed. Waiting for the rider",
  packed: "Packed. Waiting for the rider",
  shipped: "With the rider",
  delivered: "Delivered",
  rejected: "You said no",
  cancelled: "Cancelled",
  expired: "Time ran out. The shop was told",
  refunded: "Refunded",
  returned: "Returned",
};

export function supplierOrderStage(status: string, t?: Say) {
  const stage = SUPPLIER_ORDER_STAGE[status];
  return stage ? say(t, `orderStage.${status}`, stage) : status.replace(/_/g, " ");
}

/** A quote request's status. */
export const QUOTE_REQUEST_STAGE: Record<string, string> = {
  pending: "Waiting for your quote",
  responded: "Quote sent",
  accepted: "Quote accepted",
  rejected: "Declined",
  expired: "Expired",
};

export function quoteRequestStage(status: string, t?: Say) {
  const stage = QUOTE_REQUEST_STAGE[status];
  return stage ? say(t, `requestStage.${status}`, stage) : status;
}

/** "When can it be ready?" choices. The answer goes to the shop with the quote. */
export const READY_CHOICES = [
  { key: "today", label: "Today", text: "It can be ready today." },
  { key: "3days", label: "In 3 days", text: "It can be ready in 3 days." },
  { key: "week", label: "In a week", text: "It can be ready in a week." },
  { key: "2weeks", label: "In 2 weeks", text: "It can be ready in 2 weeks." },
] as const;

/** "50 pairs", "1 piece", "12 pieces". */
export function countWord(quantity: number, t?: Say) {
  return say(t, "pieces", `${quantity.toLocaleString("en-NG")} ${quantity === 1 ? "piece" : "pieces"}`, { count: quantity });
}

/** How long the shop has been waiting for an answer: "Waiting 5 minutes", "Waiting 3 hours", "Waiting 2 days". */
export function waitingLabel(iso: string | null | undefined, now = Date.now(), t?: Say) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 2) return say(t, "waiting.justIn", "Just came in");
  if (minutes < 60) return say(t, "waiting.minutes", `Waiting ${minutes} minutes`, { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return say(t, "waiting.hours", `Waiting ${hours} hour${hours === 1 ? "" : "s"}`, { count: hours });
  const days = Math.round(hours / 24);
  return say(t, "waiting.days", `Waiting ${days} day${days === 1 ? "" : "s"}`, { count: days });
}
