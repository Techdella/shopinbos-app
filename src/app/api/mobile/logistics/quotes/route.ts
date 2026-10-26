import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { packageInfo, packageSummary } from "@/components/logistics/kit";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// Price requests from shops, for the delivery partner app (the web's /logistics/quotes). GET → { waiting, answered,
// basePrice }: the ones waiting for a price (oldest first), then the last 30 already answered. Answering: ./[id].

const SELECT = {
  id: true, pickupLocation: true, destination: true, preferredDate: true, status: true, quotedPrice: true,
  partnerResponse: true, expiresAt: true, createdAt: true, packageDetails: true,
  seller: { select: { name: true, city: true, store: { select: { name: true } } } },
} as const;

export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const [waiting, answered] = await Promise.all([
    db.deliveryQuoteRequest.findMany({ where: { logisticsPartnerId: partner.id, status: "pending" }, orderBy: { createdAt: "asc" }, take: 50, select: SELECT }),
    db.deliveryQuoteRequest.findMany({ where: { logisticsPartnerId: partner.id, status: { not: "pending" } }, orderBy: { createdAt: "desc" }, take: 30, select: SELECT }),
  ]);
  const view = (quote: (typeof waiting)[number]) => ({
    id: quote.id,
    from: quote.pickupLocation,
    to: quote.destination,
    status: quote.status,
    price: quote.quotedPrice,
    note: quote.partnerResponse,
    wantedOn: quote.preferredDate?.toISOString() ?? null,
    replyBy: quote.expiresAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    shop: quote.seller.store?.name || quote.seller.name,
    city: quote.seller.city,
    parcel: packageSummary(quote.packageDetails),
    declaredValue: typeof packageInfo(quote.packageDetails).declaredValue === "number" ? packageInfo(quote.packageDetails).declaredValue! : null,
  });
  return ok({ waiting: waiting.map(view), answered: answered.map(view), basePrice: partner.basePrice > 0 ? partner.basePrice : null });
});
