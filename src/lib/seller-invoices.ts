// Invoices a seller makes by hand (web /home/invoices "New invoice", phone app/invoices): one they send to a customer,
// supplier or delivery partner, or one they got and want to note. Kept in Store.brandSettings.manualInvoices (newest
// first, at most 100). No server imports, so tests load it directly.

import { z } from "zod";

export const MANUAL_INVOICE_LIMIT = 100;
export const INVOICE_DIRECTIONS = ["sent", "received"] as const;
export const INVOICE_PARTIES = ["supplier", "logistics", "customer"] as const;

export type ManualInvoice = {
  id: string;
  direction: (typeof INVOICE_DIRECTIONS)[number];
  partyType: (typeof INVOICE_PARTIES)[number];
  partyName: string;
  partyEmail: string;
  description: string;
  amount: number;
  status: "sent" | "received" | "paid";
  createdAt: string;
};

export function readManualInvoices(settings: unknown): ManualInvoice[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [];
  const value = (settings as Record<string, unknown>).manualInvoices;
  return Array.isArray(value) ? (value as ManualInvoice[]) : [];
}

/** POST /api/app/invoices and the web form: the same fields as the web's "New invoice". */
export const ManualInvoiceSchema = z.object({
  direction: z.enum(INVOICE_DIRECTIONS).default("sent"),
  partyType: z.enum(INVOICE_PARTIES).default("supplier"),
  partyName: z.string().trim().min(1, "Type their name.").max(160),
  partyEmail: z
    .string()
    .trim()
    .max(200)
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Check their email address.")
    .default(""),
  amount: z.coerce.number().positive("Type the amount.").max(1_000_000_000),
  description: z.string().trim().min(1, "Say what it's for.").max(300),
});

export type ManualInvoiceInput = z.infer<typeof ManualInvoiceSchema>;

export function buildManualInvoice(input: ManualInvoiceInput, now = new Date()): ManualInvoice {
  return {
    id: `INV-${now.getTime().toString(36).toUpperCase()}`,
    direction: input.direction,
    partyType: input.partyType,
    partyName: input.partyName,
    partyEmail: input.partyEmail,
    description: input.description,
    amount: input.amount,
    status: input.direction,
    createdAt: now.toISOString(),
  };
}

/** The new invoice first, then the saved ones, keeping the newest 100. */
export function addManualInvoice(invoice: ManualInvoice, saved: ManualInvoice[]) {
  return [invoice, ...saved].slice(0, MANUAL_INVOICE_LIMIT);
}
