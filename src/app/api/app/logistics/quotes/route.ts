import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { DeliveryQuoteRequestSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { notifyDeliveryQuoteRequested } from "@/lib/notifications/events.server";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

  const [total, quotes] = await Promise.all([
    db.deliveryQuoteRequest.count({ where: { sellerId: user.id } }),
    db.deliveryQuoteRequest.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, pickupLocation: true, destination: true,
        packageDetails: true, preferredDate: true,
        status: true, quotedPrice: true, partnerResponse: true,
        expiresAt: true, createdAt: true,
        logisticsPartner: { select: { id: true, displayName: true, slug: true, logoUrl: true, rating: true } },
      },
    }),
  ]);

  return okList(quotes, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = DeliveryQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { logisticsPartnerId, pickupLocation, destination, packageDetails, preferredDate } = parsed.data;

  const partner = await db.logisticsPartner.findFirst({
    where: { id: logisticsPartnerId, status: "active", verificationStatus: "verified" },
  });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);

  const quote = await db.deliveryQuoteRequest.create({
    data: {
      sellerId: user.id,
      logisticsPartnerId,
      pickupLocation,
      destination,
      packageDetails,
      preferredDate,
    },
  });
  await notifyDeliveryQuoteRequested(quote.id);

  return ok(quote, 201);
});
