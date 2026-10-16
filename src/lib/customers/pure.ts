// The customers list and the customer drawer, the pure parts: reading ?page=&q=&show=&sort=&customer= from the
// URL, page numbers, who counts as a VIP, the key that groups orders into one customer, which way the seller may
// message a customer on WhatsApp (24-hour window or an approved template), and filling a template's {{n}} for
// one customer. No server imports; unit-tested in tests/customers.test.mjs.

import { withinServiceWindow, windowClosesAt } from "../inbox/whatsapp-bot.ts";
import { pageCount as sharedPageCount, pageNumbers as sharedPageNumbers } from "../pagination.ts";
import { fillTemplateVariables, renderTemplateText, variableCount, type TemplateContent, type VariableValues } from "../marketing/text-channels.ts";

// ─── The list query ──────────────────────────────────────────────────────────

export const CUSTOMERS_PAGE_SIZE = 50;
export const CUSTOMER_FILTERS = ["all", "new", "returning", "vip", "whatsapp"] as const;
export const CUSTOMER_SORTS = ["recent", "spent", "orders"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export interface CustomerListQuery {
  page: number;
  q: string;
  show: CustomerFilter;
  sort: CustomerSort;
  /** The customer whose drawer is open (their key, usually the email). */
  customer: string | null;
}

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function param(params: Params, name: string): string {
  const value = params instanceof URLSearchParams ? params.get(name) : params[name];
  return (Array.isArray(value) ? value[0] : value ?? "").toString();
}

/** Anything odd in the URL falls back to the defaults (page 1, everyone, most recent first). */
export function parseCustomerListQuery(params: Params): CustomerListQuery {
  const page = Number.parseInt(param(params, "page"), 10);
  const show = param(params, "show") as CustomerFilter;
  const sort = param(params, "sort") as CustomerSort;
  const customer = param(params, "customer").trim().slice(0, 320);
  return {
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
    q: param(params, "q").replace(/\s+/g, " ").trim().slice(0, 100),
    show: CUSTOMER_FILTERS.includes(show) ? show : "all",
    sort: CUSTOMER_SORTS.includes(sort) ? sort : "recent",
    customer: customer || null,
  };
}

/** The list URL with defaults left out, so links stay short ("/home/customers?page=2&sort=spent"). */
export function customerListHref(query: Partial<CustomerListQuery>, base = "/home/customers") {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.show && query.show !== "all") params.set("show", query.show);
  if (query.sort && query.sort !== "recent") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.customer) params.set("customer", query.customer);
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

export function pageCount(total: number, size = CUSTOMERS_PAGE_SIZE) {
  return sharedPageCount(total, size);
}

/** Page numbers to show (shared with every paged list: src/lib/pagination.ts). */
export const pageNumbers = sharedPageNumbers;

/** The search box: a LIKE pattern (wildcards in the text escaped) and the digits, for phone numbers. */
export function searchPattern(q: string): { like: string; digits: string | null } | null {
  const text = q.trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  return { like: `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, digits: digits.length >= 4 ? digits.replace(/^0+/, "") || digits : null };
}

// ─── Who is who ──────────────────────────────────────────────────────────────

/**
 * One key per customer, the same as the SQL that groups orders: the email (lowercase), else the phone's digits
 * (recorded sales often have no email), else "name:" and the name.
 */
export function customerKey(order: { buyerEmail?: string | null; buyerPhone?: string | null; buyerName?: string | null }) {
  const email = (order.buyerEmail ?? "").trim().toLowerCase();
  if (email) return email;
  const digits = (order.buyerPhone ?? "").replace(/\D/g, "");
  if (digits) return digits;
  return `name:${(order.buyerName ?? "").trim().toLowerCase()}`;
}

export type CustomerKeyKind = "email" | "phone" | "name";

export function customerKeyKind(key: string): CustomerKeyKind {
  if (key.startsWith("name:")) return "name";
  return /^\d+$/.test(key) ? "phone" : "email";
}

/** Fewer than this many customers: "VIP" means 6+ orders. From here on, the top 10% by money spent. */
export const VIP_MIN_CUSTOMERS = 10;
export const VIP_MIN_ORDERS = 6;

export type VipRule = { kind: "spend"; min: number } | { kind: "orders"; min: number };

/** `topTenthSpend` is what the customer at the 90th percentile spent. */
export function vipRule(customerCount: number, topTenthSpend: number | null | undefined): VipRule {
  const min = Number(topTenthSpend);
  if (customerCount >= VIP_MIN_CUSTOMERS && Number.isFinite(min) && min > 0) return { kind: "spend", min };
  return { kind: "orders", min: VIP_MIN_ORDERS };
}

export function isVip(customer: { orders: number; spent: number }, rule: VipRule) {
  return rule.kind === "spend" ? customer.spent >= rule.min : customer.orders >= rule.min;
}

export function customerBadge(customer: { orders: number; spent: number }, rule: VipRule): "vip" | "repeat" | "new" {
  if (isVip(customer, rule)) return "vip";
  return customer.orders > 1 ? "repeat" : "new";
}

/** A phone number that can be on WhatsApp: 10 to 15 digits once spaces and dashes are gone. */
export function hasWhatsAppNumber(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

// ─── Messaging a customer ────────────────────────────────────────────────────

export type WhatsAppBlockReason = "no_phone" | "not_connected" | "no_account" | "no_templates";

export type WhatsAppComposer =
  | { mode: "free"; closesAt: string | null; templates: boolean }
  | { mode: "template" }
  | { mode: "blocked"; reason: WhatsAppBlockReason };

/**
 * What the seller can send on WhatsApp right now. Free text only inside the 24-hour customer-care window (the
 * customer messaged the store in the last 24 hours); after that only an approved template, which needs the
 * store's WhatsApp Business Account and at least one approved template.
 */
export function whatsAppComposer(input: {
  phone: string | null | undefined;
  connected: boolean;
  /** The connection has its WhatsApp Business Account id, so templates can be used. */
  hasAccount: boolean;
  approvedTemplates: number;
  lastInboundAt: Date | string | null | undefined;
  now?: Date;
}): WhatsAppComposer {
  if (!hasWhatsAppNumber(input.phone)) return { mode: "blocked", reason: "no_phone" };
  if (!input.connected) return { mode: "blocked", reason: "not_connected" };
  const now = input.now ?? new Date();
  if (withinServiceWindow(input.lastInboundAt, now)) {
    const closes = windowClosesAt(input.lastInboundAt);
    return { mode: "free", closesAt: closes ? closes.toISOString() : null, templates: input.hasAccount && input.approvedTemplates > 0 };
  }
  if (!input.hasAccount) return { mode: "blocked", reason: "no_account" };
  if (input.approvedTemplates < 1) return { mode: "blocked", reason: "no_templates" };
  return { mode: "template" };
}

/** What a template's {{n}} can be filled with for this customer (their name, the shop, their latest order). */
export function customerTemplateValues(input: {
  name: string | null | undefined;
  storeName: string;
  storeLink: string;
  lastOrder?: { orderNumber: string; total: string; link: string; trackingCode?: string | null; trackingLink?: string | null } | null;
}): VariableValues {
  const first = (input.name ?? "").trim().split(/\s+/)[0] ?? "";
  const order = input.lastOrder;
  return {
    first_name: first,
    store_name: input.storeName,
    link: input.storeLink,
    ...(order
      ? {
          order_number: order.orderNumber,
          order_total: order.total,
          order_link: order.link,
          tracking_code: order.trackingCode || order.orderNumber,
          tracking_link: order.trackingLink || order.link,
        }
      : {}),
  };
}

/**
 * The template filled for one customer: {{1}}..{{n}} from the template's own variable mapping and the
 * customer's values, then the seller's own edits (`edits[i]` replaces {{i+1}} when it isn't empty).
 * Returns the parameters for Meta, the text the customer will read, and which values were missing.
 */
export function fillCustomerTemplate(
  template: { content: TemplateContent; variables: string[] },
  values: VariableValues,
  edits?: Array<string | null | undefined> | null,
) {
  const count = variableCount(template.content);
  const filled = fillTemplateVariables(template.variables, count, values);
  const params = filled.params.map((value, i) => {
    const edit = edits?.[i]?.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 1000);
    return edit || value;
  });
  return { params, text: renderTemplateText(template.content, params), missing: filled.missing, count };
}

/** City, state and country from an order's delivery address, for the drawer ("Ikeja, Lagos, Nigeria"). */
export function addressPlace(address: unknown): string | null {
  if (!address || typeof address !== "object" || Array.isArray(address)) return null;
  const a = address as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const parts = [text(a.city), text(a.state), text(a.country)].filter(Boolean);
  const unique = parts.filter((part, i) => parts.findIndex((p) => p.toLowerCase() === part.toLowerCase()) === i);
  return unique.length ? unique.join(", ") : null;
}

/** Private notes kept on the marketing contact (Subscriber.metadata.privateNote). */
export const NOTE_MAX = 2000;

export function readPrivateNote(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const note = (metadata as Record<string, unknown>).privateNote;
  return typeof note === "string" ? note : "";
}
