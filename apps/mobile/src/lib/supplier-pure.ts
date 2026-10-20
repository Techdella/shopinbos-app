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

// ─── "Simple app, end to end" supplier screens (E2E-Supplier prototype) ─────────────────────────────────────────

/** Orders tab segments: New, In progress (accepted, packing or waiting for the rider), Sent, and Prices (requests). */
export type SupplierOrderSegment = "new" | "pack" | "sent" | "prices";

export const ORDER_ROW_STATUS: Record<string, string> = {
  "row.new": "New",
  "row.packing": "Packing",
  "row.waiting": "Waiting for pickup",
  "row.onItsWay": "On its way",
  "row.self": "You’re delivering",
};

/** The short status at the end of an order row: New, Packing, Waiting for pickup, On its way, or the stage. */
export function orderRowStatus(order: OrderLike & { selfDelivery?: boolean; packed?: boolean }, t?: Say) {
  const group = supplierOrderGroup(order);
  // The supplier delivers it: once it's on the way (or packed for it), "You're delivering".
  if (order.selfDelivery && ((group === "pack" && order.packed) || (group === "sent" && order.next.includes("delivered")))) return say(t, "row.self", ORDER_ROW_STATUS["row.self"]);
  const key = group === "new" ? "row.new" : group === "pack" ? (order.next.includes("packed") || order.selfDelivery ? "row.packing" : "row.waiting") : order.status === "shipped" ? "row.onItsWay" : null;
  return key ? say(t, key, ORDER_ROW_STATUS[key]) : supplierOrderStage(order.status, t);
}

/** "What do you supply?" in the set-up (saved in English as the business's categories; shown in the app language). */
export const SUPPLY_CATEGORIES = ["Shoes and bags", "Fashion and fabric", "Hair and beauty", "Phones and gadgets", "Home", "Food"] as const;

/** "City" chips in the set-up; the server turns a city into its state (Aba → Abia, Abuja → FCT). */
export const SETUP_CITIES = ["Aba", "Lagos", "Kano", "Onitsha", "Ibadan", "Abuja"] as const;

/** States to pick for "Selected states": the label, and the state name the server stores. */
export const SELL_STATES: readonly { label: string; value: string }[] = [
  { label: "Lagos", value: "Lagos" },
  { label: "Ogun", value: "Ogun" },
  { label: "Oyo", value: "Oyo" },
  { label: "Abuja (FCT)", value: "FCT" },
  { label: "Kano", value: "Kano" },
  { label: "Kaduna", value: "Kaduna" },
  { label: "Rivers", value: "Rivers" },
  { label: "Enugu", value: "Enugu" },
  { label: "Anambra", value: "Anambra" },
  { label: "Abia", value: "Abia" },
  { label: "Edo", value: "Edo" },
  { label: "Delta", value: "Delta" },
];

/** "Where do you sell?" choices; the keys are the delivery settings' sellArea values. Words in m_supplier "where.<key>". */
export const SELL_AREAS = ["one_state", "selected", "nationwide"] as const;
export type SellAreaKey = (typeof SELL_AREAS)[number];

/** The banks most suppliers use, as short chips; each finds its full name in the wallet's bank list. */
export const POPULAR_BANKS: readonly { label: string; match: RegExp }[] = [
  { label: "Access Bank", match: /^access bank/i },
  { label: "GTBank", match: /guaranty trust|gtbank/i },
  { label: "Opay", match: /opay|paycom/i },
  { label: "Moniepoint", match: /moniepoint/i },
  { label: "Zenith Bank", match: /^zenith/i },
  { label: "First Bank", match: /^first bank/i },
];

/** The popular banks this server can pay into, with the wallet's own name for each. */
export function popularBanks(names: readonly string[]) {
  const out: { label: string; name: string }[] = [];
  for (const bank of POPULAR_BANKS) {
    const name = names.find((entry) => bank.match.test(entry));
    if (name) out.push({ label: bank.label, name });
  }
  return out;
}

/** "Good morning" before 12, "Good afternoon" before 5pm, then "Good evening". */
export function greetingKey(hour: number) {
  return hour < 12 ? "home.morning" : hour < 17 ? "home.afternoon" : "home.evening";
}

/** Two letters for a business without a logo: "Aba Leatherworks" → "AL". */
export function initialsOf(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** The best wholesale deal on a product: its cheapest price tier, else the plain price from the minimum order. */
export function bestWholesale(product: { wholesalePrice: number; moq: number; pricingTiers?: readonly { minQty: number; price: number }[] | null }) {
  const tiers = (product.pricingTiers ?? []).filter((tier) => tier.minQty > 0 && tier.price > 0);
  if (!tiers.length) return { price: product.wholesalePrice, minQty: Math.max(1, product.moq) };
  const cheapest = tiers.reduce((best, tier) => (tier.price < best.price ? tier : best));
  return { price: cheapest.price, minQty: cheapest.minQty };
}

/** Five or fewer left is "running low". */
export const LOW_STOCK = 5;
