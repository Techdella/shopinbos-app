import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { DeliveryQuoteResponseSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const POST = withLogistics(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);

  const quote = await db.deliveryQuoteRequest.findUnique({
    where: { id: params.id, logisticsPartnerId: partner.id },
  });
  if (!quote) return apiError("NOT_FOUND", "Quote request not found", 404);
  if (quote.status !== "pending") {
    return apiError("CONFLICT", "Quote has already been responded to", 409);
  }

  const body = await req.json().catch(() => null);
  const parsed = DeliveryQuoteResponseSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const updated = await db.deliveryQuoteRequest.update({
    where: { id: params.id },
    data: {
      status: "responded",
      quotedPrice: parsed.data.quotedPrice,
      partnerResponse: parsed.data.partnerResponse,
      expiresAt: parsed.data.expiresAt,
    },
  });

  return ok(updated);
});
