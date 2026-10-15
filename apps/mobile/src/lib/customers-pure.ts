// Customers (web /home/customers), the parts without React Native: the list query, joining "Load more" pages,
// phone links, which way the seller can write to a customer (email / WhatsApp, as the web drawer decides) and the
// body sent to POST /api/app/customers/message. Loaded directly by tests/mobile-customers.test.mjs.

export const CUSTOMER_FILTERS = ["all", "new", "returning", "vip", "whatsapp"] as const;
export const CUSTOMER_SORTS = ["recent", "spent", "orders"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];
export const PAGE_SIZE = 30;

export interface CustomerRow {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  orders: number;
  spent: number;
  badge: "vip" | "repeat" | "new";
  firstAt: string;
  lastAt: string;
}

export interface CustomerCounts {
  all: number;
  new: number;
  returning: number;
  vip: number;
  whatsapp: number;
}

export interface CustomerPage {
  items: CustomerRow[];
  page: number;
  pages: number;
  total: number;
  currency: string;
  stats: { customers: number; returning: number; orders: number; counts: CustomerCounts };
}

export interface CustomerListQuery {
  q: string;
  show: CustomerFilter;
  sort: CustomerSort;
  page: number;
}

/** The list URL; defaults are left out like on the web. */
export function customersPath(query: CustomerListQuery, limit = PAGE_SIZE) {
  const params = new URLSearchParams();
  const q = query.q.replace(/\s+/g, " ").trim().slice(0, 100);
  if (q) params.set("q", q);
  if (query.show !== "all") params.set("show", query.show);
  if (query.sort !== "recent") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  params.set("limit", String(limit));
  return `/api/app/customers?${params.toString()}`;
}

/** "Load more": the next page joined to what is on screen, without showing anyone twice. */
export function joinPages(shown: CustomerPage | null, next: CustomerPage): CustomerPage {
  if (!shown || next.page <= 1) return next;
  const seen = new Set(shown.items.map((c) => c.key));
  return { ...next, items: [...shown.items, ...next.items.filter((c) => !seen.has(c.key))] };
}

/** "₦12,500" (or "GHS 1,200" for another currency). */
export function money(amount: number, currency = "NGN") {
  const text = Math.round(Number(amount) || 0).toLocaleString("en-NG");
  return !currency || currency === "NGN" ? `₦${text}` : `${currency} ${text}`;
}

export function hasMore(list: CustomerPage | null) {
  return Boolean(list && list.page < list.pages && list.items.length < list.total);
}

/** Digits for wa.me: international form without "+"; Nigerian local numbers start with 0. */
export function whatsappNumber(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

export function whatsappLink(phone: string | null | undefined) {
  const number = whatsappNumber(phone);
  return number && number.length >= 10 && number.length <= 15 ? `https://wa.me/${number}` : null;
}

export function callLink(phone: string | null | undefined) {
  const number = (phone ?? "").replace(/[^\d+]/g, "");
  return number.replace(/\D/g, "").length >= 6 ? `tel:${number}` : null;
}

// ─── One customer (GET /api/app/customers/profile?key=) ──────────────────────

export interface TemplateContent {
  header: { format: "NONE" | "TEXT" | "IMAGE"; text?: string };
  body: string;
  footer?: string;
}

export interface CustomerTemplate {
  id: string;
  name: string;
  language: string;
  imageHeader: boolean;
  content: TemplateContent;
  variables: Array<{ n: number; key: string; value: string }>;
  preview: string;
}

export type WhatsAppComposer =
  | { mode: "free"; closesAt: string | null; templates: boolean }
  | { mode: "template" }
  | { mode: "blocked"; reason: "no_phone" | "not_connected" | "no_account" | "no_templates" };

export interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface CustomerProfile {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  place: string | null;
  currency: string;
  stats: { orders: number; paidOrders: number; spent: number; average: number; firstAt: string; lastAt: string };
  orders: Array<{ id: string; orderNumber: string; total: number; currency: string; status: string; createdAt: string }>;
  emailChannel: {
    address: string | null;
    connected: boolean;
    provider: string;
    from: string | null;
    ready: boolean;
    recommended: { option: string; domain: string | null } | null;
    setupHref: string;
    conversationId: string | null;
    messages: ThreadMessage[];
  };
  whatsapp: {
    phone: string | null;
    composer: WhatsAppComposer;
    conversationId: string | null;
    messages: ThreadMessage[];
    setupHref: string;
    templatesHref: string;
    templates: CustomerTemplate[];
  };
}

export type Channel = "email" | "whatsapp";

/**
 * What the message box shows for a channel, as the web drawer decides: the composer ("write" free text or
 * "template"), or why it can't be used yet and what would fix it.
 */
export type ComposerState =
  | { kind: "write"; channel: Channel; subject: boolean; closesAt?: string | null; canUseTemplate?: boolean }
  | { kind: "template" }
  | { kind: "blocked"; reason: "noEmail" | "connectEmail" | "emailNotReady" | "noPhone" | "waNotConnected" | "waNoAccount" | "waNoTemplates" };

export function composerState(profile: CustomerProfile, channel: Channel, useTemplate = false): ComposerState {
  if (channel === "email") {
    const mail = profile.emailChannel;
    if (!mail.address) return { kind: "blocked", reason: "noEmail" };
    if (!mail.connected) return { kind: "blocked", reason: "connectEmail" };
    if (!mail.ready) return { kind: "blocked", reason: "emailNotReady" };
    return { kind: "write", channel, subject: mail.messages.length === 0 };
  }
  const composer = profile.whatsapp.composer;
  if (composer.mode === "blocked") {
    const reason = composer.reason === "no_phone" ? "noPhone" : composer.reason === "not_connected" ? "waNotConnected" : composer.reason === "no_account" ? "waNoAccount" : "waNoTemplates";
    return { kind: "blocked", reason };
  }
  if (composer.mode === "template") return profile.whatsapp.templates.length ? { kind: "template" } : { kind: "blocked", reason: "waNoTemplates" };
  if (useTemplate && composer.templates && profile.whatsapp.templates.length) return { kind: "template" };
  return { kind: "write", channel, subject: false, closesAt: composer.closesAt, canUseTemplate: composer.templates && profile.whatsapp.templates.length > 0 };
}

/** Email when the customer has an address and email is set up; else WhatsApp when it can be used; else email. */
export function firstChannel(profile: CustomerProfile): Channel {
  if (composerState(profile, "email").kind === "write") return "email";
  if (composerState(profile, "whatsapp").kind !== "blocked") return "whatsapp";
  return profile.emailChannel.address ? "email" : profile.whatsapp.phone ? "whatsapp" : "email";
}

/** {{1}}..{{n}} filled in the header, body and footer, as the customer will read it (same as the web). */
export function renderTemplateText(content: TemplateContent, params: string[]) {
  const fill = (text: string) => text.replace(/{{\s*(\d+)\s*}}/g, (_, n: string) => params[Number(n) - 1] ?? `{{${n}}}`);
  return [content.header.format === "TEXT" ? content.header.text ?? "" : "", fill(content.body), content.footer ?? ""].filter((part) => part.trim()).join("\n\n");
}

/** The template's text with the seller's edits; an empty box keeps the value the shop filled in. */
export function templatePreview(template: CustomerTemplate, edits: string[]) {
  return renderTemplateText(template.content, template.variables.map((v, i) => edits[i]?.trim() || v.value));
}

export type MessageBody =
  | { key: string; channel: "email"; subject: string | null; body: string }
  | { key: string; channel: "whatsapp"; body: string }
  | { key: string; channel: "whatsapp_template"; templateId: string; params: string[] };

export function messageBody(
  key: string,
  state: ComposerState,
  input: { subject?: string; body?: string; template?: CustomerTemplate | null; edits?: string[] },
): MessageBody | null {
  if (state.kind === "blocked") return null;
  if (state.kind === "template") {
    const template = input.template;
    if (!template) return null;
    return { key, channel: "whatsapp_template", templateId: template.id, params: template.variables.map((v, i) => input.edits?.[i]?.trim() || v.value) };
  }
  const body = (input.body ?? "").trim();
  if (!body) return null;
  if (state.channel === "email") return { key, channel: "email", subject: input.subject?.trim() || null, body };
  return { key, channel: "whatsapp", body };
}

/** Reasons the server gives by code that have their own words (the web drawer's "chat.err.<code>", in customers). */
export const SEND_CODES = ["NO_EMAIL", "NO_PHONE", "NOT_APPROVED", "OPTED_OUT", "NO_PICTURE", "RATE_LIMITED", "EMAIL_NOT_CONNECTED"] as const;

/** The words key for a message that didn't go: WhatsApp's or the mail service's own reason goes in "{reason}". */
export function sendErrorKey(code: string | undefined) {
  if (code === "SEND_FAILED") return "chat.err.sendFailed";
  return code && (SEND_CODES as readonly string[]).includes(code) ? `chat.err.${code}` : null;
}

/** English names for template details ({{n}} filled with…); translated with the web's emailBuilder "detail.<key>". */
export const DETAIL_LABEL: Record<string, string> = {
  first_name: "First name",
  store_name: "Store name",
  discount_code: "Discount code",
  link: "Link to your shop",
  order_number: "Order number",
  order_total: "Order total",
  order_link: "Order page link",
  tracking_code: "Tracking code",
  tracking_link: "Tracking link",
  cart_link: "Cart link",
  cart_items: "Cart items",
  product_name: "Product name",
};
