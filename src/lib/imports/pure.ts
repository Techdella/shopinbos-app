// China imports (Find products › From China, My imports, Admin › China imports): pure helpers, unit-tested in
// tests/imports.test.mjs. Sellers send a ShopKonfam or 1688 link (or a photo, or a description); the sourcing partner
// (ShopKonfam) quotes it in naira, the seller accepts and pays, and the partner moves the order through each step
// until it's delivered. Stored in the ImportOrder table (docs/migrations/2026-11-30-import-orders.sql).

/** The seller's timeline, in order. Keys match the importStep.* messages. */
export const IMPORT_STEPS = [
  { key: "requested", label: "Quote requested" },
  { key: "quoted", label: "Quote ready" },
  { key: "quote_paid", label: "Quote paid" },
  { key: "bought", label: "Bought from the factory" },
  { key: "checked", label: "Checked, QC photos" },
  { key: "shipping", label: "Shipping to Lagos" },
  { key: "customs", label: "Customs in Lagos" },
  { key: "in_stock", label: "In your stock" },
] as const;

export type ImportStep = (typeof IMPORT_STEPS)[number]["key"];
/** Off the timeline: the seller declined the quote, or the partner or seller cancelled. */
export type ImportClosed = "declined" | "cancelled";
export type ImportStatus = ImportStep | ImportClosed;

export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = {
  ...(Object.fromEntries(IMPORT_STEPS.map((step) => [step.key, step.label])) as Record<ImportStep, string>),
  declined: "Quote declined",
  cancelled: "Cancelled",
};

/** Pill tones (src/components/app-kit Tone) on the partner's queue. */
export const IMPORT_STATUS_TONE: Record<ImportStatus, "warning" | "info" | "accent" | "success" | "muted"> = {
  requested: "warning",
  quoted: "info",
  quote_paid: "accent",
  bought: "accent",
  checked: "accent",
  shipping: "accent",
  customs: "accent",
  in_stock: "success",
  declined: "muted",
  cancelled: "muted",
};

export type ImportSource = "shopkonfam" | "1688" | "photo" | "description";

export const IMPORT_SOURCE_LABEL: Record<ImportSource, string> = {
  shopkonfam: "ShopKonfam link",
  "1688": "1688 link",
  photo: "Photo",
  description: "Description",
};

export const IMPORT_PARTNER = { key: "shopkonfam", name: "ShopKonfam", site: "https://shopkonfam.com" } as const;

export function isImportStatus(value: unknown): value is ImportStatus {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(IMPORT_STATUS_LABEL, value);
}

export function importStepIndex(status: ImportStatus) {
  return IMPORT_STEPS.findIndex((step) => step.key === status);
}

/** 0–100 for the progress bar (closed imports show 0). */
export function importProgress(status: ImportStatus) {
  const index = importStepIndex(status);
  return index < 0 ? 0 : Math.round((index / (IMPORT_STEPS.length - 1)) * 100);
}

export function isImportOpen(status: ImportStatus) {
  return status !== "in_stock" && status !== "declined" && status !== "cancelled";
}

/** Imports still on their way (the "My imports · N" count). */
export function activeImportCount(imports: { status: ImportStatus }[]) {
  return imports.filter((item) => isImportOpen(item.status)).length;
}

// ─── Links ────────────────────────────────────────────────────────────────────

export interface ImportLink {
  source: "shopkonfam" | "1688";
  /** Tidied: https, no tracking query. */
  url: string;
  /** 1688 offer id, or the last part of a ShopKonfam product path. */
  productRef: string | null;
}

function asUrl(input: string) {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function onDomain(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** A 1688 product link, tidied ("https://detail.1688.com/offer/123.html"), or null if it isn't one. */
export function parse1688Link(input: string): { url: string; offerId: string | null } | null {
  const url = asUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!onDomain(host, "1688.com")) return null;
  const offerId = url.pathname.match(/offer\/(\d{5,})/)?.[1] ?? url.searchParams.get("offerId") ?? null;
  return { url: offerId ? `https://detail.1688.com/offer/${offerId}.html` : `https://${host}${url.pathname}`, offerId };
}

/** A ShopKonfam product link, tidied, or null if it isn't one. */
export function parseShopKonfamLink(input: string): { url: string; slug: string | null } | null {
  const url = asUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  if (!onDomain(host, "shopkonfam.com")) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const slug = path === "/" ? null : decodeURIComponent(path.split("/").pop() ?? "").slice(0, 120) || null;
  return { url: `https://${host.replace(/^www\./, "")}${path === "/" ? "" : path}`, slug };
}

/** A link sellers can import from (ShopKonfam or 1688), or null. */
export function parseImportLink(input: string): ImportLink | null {
  const konfam = parseShopKonfamLink(input);
  if (konfam) return { source: "shopkonfam", url: konfam.url, productRef: konfam.slug };
  const alibaba = parse1688Link(input);
  if (alibaba) return { source: "1688", url: alibaba.url, productRef: alibaba.offerId };
  return null;
}

/** Does the text look like someone pasted a web address (any site)? */
export function looksLikeLink(input: string) {
  return /^(https?:\/\/|www\.)/i.test(input.trim()) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(input.trim());
}

/** The request's title: the seller's words, else a name from the link. */
export function importTitle(input: { description?: string | null; link?: ImportLink | null; hasPhoto?: boolean }) {
  const words = input.description?.trim();
  if (words) return words.slice(0, 140);
  if (input.link?.source === "shopkonfam") return input.link.productRef ? `ShopKonfam item ${input.link.productRef.replace(/[-_]+/g, " ")}`.slice(0, 140) : "ShopKonfam item";
  if (input.link?.source === "1688") return `1688 item${input.link.productRef ? ` ${input.link.productRef}` : ""}`;
  return input.hasPhoto ? "Product from your photo" : "Import request";
}

// ─── Quotes ───────────────────────────────────────────────────────────────────

export interface ImportQuoteInput {
  unitPrice: number;
  quantity: number;
  freight: number;
  customs: number;
  serviceFee: number;
}

/** Goods, then the landed total, in whole naira. */
export function quoteTotals(input: ImportQuoteInput) {
  const goods = Math.round(input.unitPrice * input.quantity);
  const total = goods + Math.round(input.freight) + Math.round(input.customs) + Math.round(input.serviceFee);
  return { goods, total, landedUnit: input.quantity > 0 ? Math.round(total / input.quantity) : 0 };
}

/** Can the seller still accept this quote? */
export function quoteOpen(order: { status: ImportStatus; quoteValidUntil: Date | string | null; acceptedAt?: Date | string | null }, now = Date.now()) {
  if (order.status !== "quoted") return false;
  if (!order.quoteValidUntil) return true;
  return new Date(order.quoteValidUntil).getTime() >= now;
}

// ─── The partner's next step ──────────────────────────────────────────────────

/** What the sourcing partner does next on an order, by its status (the quote form covers requested). */
export const PARTNER_NEXT: Partial<Record<ImportStatus, { to: ImportStep; label: string; help: string }>> = {
  quoted: { to: "quote_paid", label: "Mark as paid", help: "The seller's payment has reached you." },
  quote_paid: { to: "bought", label: "Bought from the factory", help: "You've placed the order with the factory." },
  bought: { to: "checked", label: "QC done", help: "Add QC photos first, so the seller sees what's coming." },
  checked: { to: "shipping", label: "Shipped", help: "Add the carrier, tracking number and arrival date." },
  shipping: { to: "customs", label: "Arrived, in customs", help: "The goods are in Lagos, clearing customs." },
  customs: { to: "in_stock", label: "Delivered", help: "The seller has the goods." },
};

/** Filters on Admin › China imports. */
export const PARTNER_FILTERS = [
  { key: "new", label: "New requests", statuses: ["requested"] },
  { key: "quoted", label: "Quoted", statuses: ["quoted"] },
  { key: "active", label: "In progress", statuses: ["quote_paid", "bought", "checked", "shipping", "customs"] },
  { key: "done", label: "Delivered", statuses: ["in_stock"] },
  { key: "closed", label: "Declined or cancelled", statuses: ["declined", "cancelled"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ImportStatus[] }[];

export type PartnerFilter = (typeof PARTNER_FILTERS)[number]["key"] | "all";

export function partnerFilter(value: unknown): PartnerFilter {
  return value === "all" || PARTNER_FILTERS.some((filter) => filter.key === value) ? (value as PartnerFilter) : "new";
}

export function statusesFor(filter: PartnerFilter): ImportStatus[] | null {
  if (filter === "all") return null;
  return [...(PARTNER_FILTERS.find((item) => item.key === filter)?.statuses ?? [])];
}

// ─── History ──────────────────────────────────────────────────────────────────

export interface ImportEvent {
  status: ImportStatus;
  at: string;
  /** "seller" | "partner" | "team" */
  by: string;
  note?: string;
}

export function parseImportEvents(value: unknown): ImportEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .filter((item) => isImportStatus(item.status) && typeof item.at === "string")
    .map((item) => ({
      status: item.status as ImportStatus,
      at: item.at as string,
      by: typeof item.by === "string" ? item.by : "team",
      ...(typeof item.note === "string" && item.note ? { note: item.note.slice(0, 300) } : {}),
    }))
    .slice(-50);
}

/** When each step was reached (the latest time), for the timeline. */
export function stepTimes(events: ImportEvent[]) {
  const times: Partial<Record<ImportStatus, string>> = {};
  for (const event of events) times[event.status] = event.at;
  return times;
}

export function importRef(sequence: number) {
  return `IMP-${sequence}`;
}
