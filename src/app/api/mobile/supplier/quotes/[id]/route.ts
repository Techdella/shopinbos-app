import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { quoteReplyText } from "../../_rules";
import { canTrade, supplierForUser } from "../../_shared";
import { notifySupplierQuoteAnswered } from "@/lib/notifications/events.server";

export const dynamic = "force-dynamic";

// One quote request in the supplier app. GET → the request with the product's usual prices.
// POST { intent: "respond", quotedPrice, moq?, note?, validDays? } or { intent: "decline", note? } — the same
// outcome as the web form (src/app/actions/supplier.ts respondToSupplierQuote); the minimum order goes in the reply.

const Body = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("respond"),
    quotedPrice: z.number().positive("Enter your price per unit."),
    moq: z.number().int().min(1).max(1_000_000).optional(),
    note: z.string().max(800).optional(),
    validDays: z.number().int().min(1).max(90).optional(),
  }),
  z.object({ intent: z.literal("decline"), note: z.string().max(800).optional() }),
]);

const SELECT = {
  id: true, quantity: true, destination: true, notes: true, status: true, quotedPrice: true, supplierResponse: true, expiresAt: true, createdAt: true,
  seller: { select: { id: true, name: true, store: { select: { name: true } } } },
  supplierProduct: { select: { id: true, name: true, images: true, wholesalePrice: true, moq: true, stockQuantity: true } },
} as const;

function view(quote: NonNullable<Awaited<ReturnType<typeof findQuote>>>) {
  return {
    id: quote.id,
    quantity: quote.quantity,
    destination: quote.destination,
    notes: quote.notes,
    status: quote.status,
    quotedPrice: quote.quotedPrice,
    reply: quote.supplierResponse,
    expiresAt: quote.expiresAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    seller: { userId: quote.seller.id, name: quote.seller.name, shop: quote.seller.store?.name ?? null },
    product: {
      id: quote.supplierProduct.id,
      name: quote.supplierProduct.name,
      image: quote.supplierProduct.images[0] ?? null,
      wholesalePrice: quote.supplierProduct.wholesalePrice,
      moq: quote.supplierProduct.moq,
      stock: quote.supplierProduct.stockQuantity,
    },
  };
}

function findQuote(supplierId: string, id: string) {
  return db.supplierQuoteRequest.findFirst({ where: { id, supplierId }, select: SELECT });
}

export const GET = withSupplier(async (_req: NextRequest, { user, params }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const quote = await findQuote(supplier.id, String(params.id));
  if (!quote) return apiError("NOT_FOUND", "Quote request not found", 404);
  return ok(view(quote));
});

const DECLINE = "Thanks for reaching out. This request is not a fit for us right now.";

export const POST = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (!canTrade(supplier)) return apiError("VERIFICATION_REQUIRED", "Finish setting up and get verified before you send quotes.", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the quote details.");
  const input = parsed.data;

  const data = input.intent === "decline"
    ? { status: "rejected" as const, supplierResponse: input.note?.trim() || DECLINE }
    : {
        status: "responded" as const,
        quotedPrice: input.quotedPrice,
        supplierResponse: quoteReplyText(input.note, input.moq),
        expiresAt: input.validDays ? new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000) : undefined,
      };
  // Only a still-pending request is answered, so two replies at once can't both win.
  const updated = await db.supplierQuoteRequest.updateMany({ where: { id: String(params.id), supplierId: supplier.id, status: "pending" }, data });
  if (updated.count === 0) return apiError("CONFLICT", "This request has already been answered.", 409);
  if (data.status === "responded") void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "quote_sent", ref: String(params.id) })).catch(() => undefined);
  await notifySupplierQuoteAnswered(String(params.id));
  const quote = await findQuote(supplier.id, String(params.id));
  return ok(quote ? view(quote) : null);
});
