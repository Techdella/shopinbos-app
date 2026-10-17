// Pure helpers for the phone's Payouts and Invoices screens (app/payouts.tsx, app/invoices). No imports, so
// tests/mobile-money.test.mjs loads this file directly. The rules mirror the web's /home/payouts, /home/invoices and
// src/lib/seller-invoices.ts (the server checks everything again).

// ─── Payouts ──────────────────────────────────────────────────────────────────

export interface PayoutOrder {
  id: string;
  orderNumber: string;
  buyerName: string | null;
  total: number;
  status: string;
  paymentMethod: string | null;
  /** Paid online (Paystack): the money goes to the payout bank. Otherwise the seller collected it. */
  online: boolean;
  createdAt: string;
}

/** Same tabs as the web: paid online (the default), collected yourself, all. */
export const PAYOUT_FILTERS = ["online", "offline", "all"] as const;
export type PayoutFilter = (typeof PAYOUT_FILTERS)[number];

export function filterPayouts(orders: PayoutOrder[], filter: PayoutFilter) {
  if (filter === "all") return orders;
  return orders.filter((order) => (filter === "online" ? order.online : !order.online));
}

export function countPayouts(orders: PayoutOrder[]): Record<PayoutFilter, number> {
  const online = orders.filter((order) => order.online).length;
  return { online, offline: orders.length - online, all: orders.length };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const INVOICE_DIRECTIONS = ["sent", "received"] as const;
export const INVOICE_PARTIES = ["supplier", "logistics", "customer"] as const;
export type InvoiceDirection = (typeof INVOICE_DIRECTIONS)[number];
export type InvoiceParty = (typeof INVOICE_PARTIES)[number];

export const INVOICE_TABS = ["orders", "manual"] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];

export interface InvoiceForm {
  direction: InvoiceDirection;
  partyType: InvoiceParty;
  partyName: string;
  partyEmail: string;
  amount: string;
  description: string;
}

export const EMPTY_INVOICE: InvoiceForm = { direction: "sent", partyType: "supplier", partyName: "", partyEmail: "", amount: "", description: "" };

/** "₦12,500" or "12500.50" → 12500.5; null when it isn't a positive amount. */
export function parseAmount(text: string): number | null {
  const cleaned = String(text ?? "").replace(/[₦,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 && value <= 1_000_000_000 ? value : null;
}

export const looksLikeEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());

/** What to fix before saving (an m_money "inv.problem.<key>"), or null. */
export function invoiceProblem(form: InvoiceForm): "name" | "amount" | "description" | "email" | null {
  if (!form.partyName.trim()) return "name";
  if (parseAmount(form.amount) === null) return "amount";
  if (!form.description.trim()) return "description";
  if (form.partyEmail.trim() && !looksLikeEmail(form.partyEmail)) return "email";
  return null;
}

/** POST /api/app/invoices body (ManualInvoiceSchema on the server). Only call when invoiceProblem is null. */
export function invoiceBody(form: InvoiceForm) {
  return {
    direction: form.direction,
    partyType: form.partyType,
    partyName: form.partyName.trim(),
    partyEmail: form.partyEmail.trim(),
    amount: parseAmount(form.amount) ?? 0,
    description: form.description.trim(),
  };
}

export interface InvoiceLine {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

/** An order's invoice lines and totals (delivery and discount only when there is one). */
export function invoiceTotals(order: { items?: { name?: string; price?: number; quantity?: number }[] | null; subtotal?: number | null; shippingFee?: number | null; discountAmount?: number | null; total: number }) {
  const lines: InvoiceLine[] = (Array.isArray(order.items) ? order.items : []).map((item) => {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const price = Number(item.price) || 0;
    return { name: String(item.name || "").trim() || "Item", quantity, price, total: price * quantity };
  });
  const linesTotal = lines.reduce((sum, line) => sum + line.total, 0);
  return {
    lines,
    subtotal: Number(order.subtotal ?? linesTotal) || 0,
    delivery: Number(order.shippingFee) || 0,
    discount: Number(order.discountAmount) || 0,
    total: Number(order.total) || 0,
  };
}

/** Tone for an order's status badge, the same as the web's invoice list. */
export function orderStatusTone(status: string): "success" | "accent" | "warning" | "muted" {
  if (status === "delivered") return "success";
  if (["paid", "processing", "packed", "shipped"].includes(status)) return "accent";
  if (status === "pending" || status === "awaiting_payment") return "warning";
  return "muted";
}
