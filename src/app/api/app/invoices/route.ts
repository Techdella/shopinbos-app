import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created, ok } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { createManualInvoice, sellerInvoices } from "@/lib/seller-money.server";
import { ManualInvoiceSchema } from "@/lib/seller-invoices";

export const dynamic = "force-dynamic";

// Invoices for the phone app (web /home/invoices shows the same).
//   GET  → { data: { summary, orders (latest 100, each an order invoice), manual (invoices the seller made) } }
//   POST { direction: "sent"|"received", partyType: "supplier"|"logistics"|"customer", partyName, partyEmail?, amount,
//          description } → 201 { data: { invoice, emailed } } (a sent invoice with an email is emailed, as on the web)

export const GET = withSeller(async (_req, { user }) => {
  const data = await sellerInvoices(user.id);
  if (!data) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(data);
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (!checkRateLimit(`manual-invoice:${user.id}`, { maxRequests: 20, windowMs: 60_000 }).allowed) {
    return apiError("RATE_LIMITED", "That's a lot of invoices at once. Wait a minute and try again.", 429);
  }
  const parsed = ManualInvoiceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the invoice details.");
  const result = await createManualInvoice({ id: user.id, email: user.email }, parsed.data);
  if (!result) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return created(result);
});
