import "server-only";
import { db } from "@/lib/db/client";
import { DeliveryQuoteResponseSchema } from "@/lib/schemas";

// A partner's reply to a seller's delivery quote request: a price (with an optional note and expiry) or a decline.
// Shared by the portal's quote forms and POST /v1/partner/quotes so both follow the same rules.

export const DEFAULT_DECLINE_MESSAGE = "Thanks for reaching out. This route is not available for us right now.";

export type QuoteReplyResult =
  | { ok: true; quote: { id: string; status: string; quotedPrice: number | null; partnerResponse: string | null; expiresAt: Date | null } }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST"; error: string };

export async function replyToQuote(input: {
  partnerId: string;
  quoteId: string;
  intent: "respond" | "reject";
  quotedPrice?: number;
  partnerResponse?: string;
  expiresAt?: string | Date;
}): Promise<QuoteReplyResult> {
  const quote = input.quoteId
    ? await db.deliveryQuoteRequest.findFirst({ where: { id: input.quoteId, logisticsPartnerId: input.partnerId }, select: { id: true, status: true } })
    : null;
  if (!quote) return { ok: false, code: "NOT_FOUND", error: "Quote not found." };
  if (quote.status !== "pending") return { ok: false, code: "CONFLICT", error: "This quote has already been handled." };

  const partnerResponse = input.partnerResponse?.trim() || undefined;
  let data: { status: "rejected" | "responded"; quotedPrice?: number; partnerResponse?: string; expiresAt?: Date };
  if (input.intent === "reject") {
    data = { status: "rejected", partnerResponse: partnerResponse ?? DEFAULT_DECLINE_MESSAGE };
  } else {
    const parsed = DeliveryQuoteResponseSchema.safeParse({ quotedPrice: input.quotedPrice, partnerResponse, expiresAt: input.expiresAt || undefined });
    if (!parsed.success) return { ok: false, code: "BAD_REQUEST", error: parsed.error.issues[0]?.message ?? "Check the quote details." };
    data = { status: "responded", ...parsed.data };
  }

  // Only a still-pending quote is updated, so two replies at once can't both win.
  const updated = await db.deliveryQuoteRequest.updateMany({ where: { id: quote.id, status: "pending" }, data });
  if (updated.count === 0) return { ok: false, code: "CONFLICT", error: "This quote has already been handled." };
  const saved = await db.deliveryQuoteRequest.findUniqueOrThrow({
    where: { id: quote.id },
    select: { id: true, status: true, quotedPrice: true, partnerResponse: true, expiresAt: true },
  });
  return { ok: true, quote: saved };
}
