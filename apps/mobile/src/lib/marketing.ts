import { api, apiBody } from "./api";

// Marketing quick view: GET /api/mobile/marketing (campaigns, totals, discount codes), new codes through
// POST /api/app/marketing/discounts, and the email templates gallery from GET /api/app/marketing/templates.

export interface CampaignRow {
  id: string;
  name: string;
  subject: string | null;
  channel: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled" | string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  revenueGenerated: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface DiscountRow {
  id: string;
  name: string;
  code: string;
  type: "percentage" | "fixed_amount" | "free_shipping" | "bogo";
  value: number;
  status: "draft" | "active" | "disabled";
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  orders: number;
  revenue: number;
}

export interface MarketingOverview {
  totals: { campaignsSent: number; sent: number; opens: number; clicks: number; revenue: number; subscribers: number };
  campaigns: CampaignRow[];
  discounts: DiscountRow[];
}

export const fetchMarketing = () => api<MarketingOverview>("/api/mobile/marketing");

export interface QuickDiscount {
  name: string;
  code: string;
  type: "percentage" | "fixed_amount" | "free_shipping";
  value: number;
  expiresAt: string | null;
}

export const createDiscount = (input: QuickDiscount) => api<DiscountRow>("/api/app/marketing/discounts", { method: "POST", json: { ...input, status: "active" } });

export interface TemplateRow {
  key?: string;
  id?: string;
  name: string;
  description?: string;
  subject: string;
  category: string | null;
  preheader: string | null;
}

export const fetchTemplates = () => api<{ saved: TemplateRow[]; library: TemplateRow[] }>("/api/app/marketing/templates");

/** Pass the screen's `t` (with "m_marketing") for the words in the app language ("discount.*"). */
export function discountLabel(discount: Pick<DiscountRow, "type" | "value">, money: (n: number) => string, t?: { dynamic(key: string, fallback?: string, vars?: Record<string, string | number>): string }) {
  const say = (key: string, english: string, vars?: Record<string, string | number>) => (t ? t.dynamic(key, english, vars) : english);
  if (discount.type === "percentage") return say("discount.percent", `${discount.value}% off`, { value: discount.value });
  if (discount.type === "fixed_amount") return say("discount.amount", `${money(discount.value)} off`, { amount: money(discount.value) });
  if (discount.type === "free_shipping") return say("discount.freeDelivery", "Free delivery");
  return say("discount.bxgy", "Buy X get Y");
}

/** A code from the name and amount ("Weekend sale", 20 → "WEEKENDS20"): letters and digits, at most 12. */
export function suggestCode(name: string, value: number) {
  const word = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "SAVE";
  return `${word}${value > 0 && value <= 100 ? Math.round(value) : ""}`.slice(0, 12);
}

// ─── Subscribers (web /home/marketing/subscribers): GET and POST /api/app/marketing/subscribers ──────────

export type SubscriberStatus = "active" | "unsubscribed" | "bounced" | "spam";

export interface SubscriberRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: SubscriberStatus;
  source: string;
  tags: string[];
  createdAt: string;
  consent: { email: boolean; text: boolean } | null;
}

export interface SubscriberPage {
  rows: SubscriberRow[];
  total: number;
  page: number;
  pages: number;
  counts: Record<SubscriberStatus | "all", number>;
  newThisMonth: number;
}

export async function fetchSubscribers(query: { q?: string; status?: SubscriberStatus | null; page?: number }): Promise<SubscriberPage> {
  const params = new URLSearchParams({ limit: "50", page: String(query.page ?? 1) });
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.status) params.set("status", query.status);
  const body = await apiBody<{ data: SubscriberRow[]; meta: { page: number; total: number; pages: number; counts: SubscriberPage["counts"]; newThisMonth: number } }>(`/api/app/marketing/subscribers?${params.toString()}`);
  return { rows: body.data, total: body.meta.total, page: body.meta.page, pages: body.meta.pages, counts: body.meta.counts, newThisMonth: body.meta.newThisMonth };
}

export interface NewSubscriber {
  email: string;
  name: string;
  phone: string;
  birthday: string;
  tags: string;
  emailOk: boolean;
  textOk: boolean;
  note: string;
  welcome: boolean;
}

/** The same body the web's "Add a person" sends. */
export function subscriberBody(form: NewSubscriber) {
  return {
    email: form.email.trim(),
    name: form.name.trim() || null,
    phone: form.phone.trim() || null,
    birthday: form.birthday.trim() || null,
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    consent: { email: form.emailOk, sms: form.textOk, whatsapp: form.textOk, note: form.note.trim() || undefined },
    sendWelcome: form.welcome,
  };
}

export const addSubscriber = (form: NewSubscriber) => api<{ id: string; created: boolean }>("/api/app/marketing/subscribers", { method: "POST", json: subscriberBody(form) });
