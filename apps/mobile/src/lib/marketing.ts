import { api } from "./api";

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

export function discountLabel(discount: Pick<DiscountRow, "type" | "value">, money: (n: number) => string) {
  if (discount.type === "percentage") return `${discount.value}% off`;
  if (discount.type === "fixed_amount") return `${money(discount.value)} off`;
  if (discount.type === "free_shipping") return "Free delivery";
  return "Buy X get Y";
}

/** A code from the name and amount ("Weekend sale", 20 → "WEEKENDS20"): letters and digits, at most 12. */
export function suggestCode(name: string, value: number) {
  const word = name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8) || "SAVE";
  return `${word}${value > 0 && value <= 100 ? Math.round(value) : ""}`.slice(0, 12);
}
