import type { PayoutBankSummary } from "@shared/seller-payments";
import { api } from "./api";
import { invoiceBody, type InvoiceDirection, type InvoiceForm, type InvoiceParty, type PayoutOrder } from "./money-pure";

// Payouts and Invoices on the phone, the same numbers as the web pages /home/payouts and /home/invoices:
//   GET  /api/app/payouts    paid orders (latest 100), where each one's money went, the payout bank
//   GET  /api/app/invoices   every order's invoice (latest 100) and the invoices the seller made
//   POST /api/app/invoices   make an invoice (a sent one with an email is emailed)
// An order invoice's lines come from GET /api/app/orders/[id] (lib/orders.ts).

export interface PayoutsData {
  hasStore: boolean;
  bank: PayoutBankSummary | null;
  online: { total: number; count: number };
  offline: { total: number; count: number };
  orders: PayoutOrder[];
}

export const fetchPayouts = () => api<PayoutsData>("/api/app/payouts");

export interface OrderInvoice {
  id: string;
  orderNumber: string;
  buyerName: string | null;
  buyerEmail: string | null;
  subtotal: number;
  shippingFee: number;
  total: number;
  currency: string;
  status: string;
  createdAt: string;
}

export interface ManualInvoice {
  id: string;
  direction: InvoiceDirection;
  partyType: InvoiceParty;
  partyName: string;
  partyEmail: string;
  description: string;
  amount: number;
  status: "sent" | "received" | "paid";
  createdAt: string;
}

export interface InvoicesData {
  summary: { orders: number; waiting: { total: number; count: number }; paid: number; totalOrdered: number };
  orders: OrderInvoice[];
  manual: ManualInvoice[];
}

export const fetchInvoices = () => api<InvoicesData>("/api/app/invoices");

export const createInvoice = (form: InvoiceForm) =>
  api<{ invoice: ManualInvoice; emailed: boolean }>("/api/app/invoices", { method: "POST", json: invoiceBody(form) });
