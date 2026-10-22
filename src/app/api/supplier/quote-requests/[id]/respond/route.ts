import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { QuoteResponseSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { notifySupplierQuoteAnswered } from "@/lib/notifications/events.server";

export const POST = withSupplier(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const quote = await db.supplierQuoteRequest.findUnique({
    where: { id: params.id, supplierId: supplier.id },
  });
  if (!quote) return apiError("NOT_FOUND", "Quote request not found", 404);
  if (quote.status !== "pending") {
    return apiError("CONFLICT", "Quote has already been responded to", 409);
  }

  const body = await req.json().catch(() => null);
  const parsed = QuoteResponseSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const updated = await db.supplierQuoteRequest.update({
    where: { id: params.id },
    data: {
      status: "responded",
      quotedPrice: parsed.data.quotedPrice,
      supplierResponse: parsed.data.supplierResponse,
      expiresAt: parsed.data.expiresAt,
    },
  });
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "quote_sent", ref: updated.id })).catch(() => undefined);
  await notifySupplierQuoteAnswered(updated.id);

  return ok(updated);
});
