import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { partnerDetail } from "@/lib/delivery-market/manage.server";
import { withOwner } from "../../_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/delivery/partners/[slug]: a partner's page as a seller or supplier sees it: stats, coverage,
// services, the public rate card with other fees and notes, pickup points, reviews, and this business's connection
// and private rates with them. No phone number or bank details: everything goes through the app.
export const GET = withOwner(async (_req: NextRequest, { user, params }) => {
  const detail = await partnerDetail(String(params.slug), user.id);
  if (!detail) return apiError("NOT_FOUND", "This delivery partner isn't taking new businesses right now.", 404);
  const { partner } = detail;
  return ok({
    partner: {
      id: partner.id,
      slug: partner.slug,
      userId: partner.userId,
      name: partner.displayName,
      description: partner.description,
      logoUrl: partner.logoUrl,
      city: partner.city,
      rating: partner.rating,
      ratingCount: partner.ratingCount,
      verified: partner.verificationStatus === "verified",
      services: partner.services,
      pickupAreas: partner.pickupAreas,
      deliveryAreas: partner.deliveryAreas,
      offersPayOnDelivery: partner.offersPayOnDelivery,
      pickupPoints: partner.pickupPoints.map((point) => ({ id: point.id, name: point.name, address: point.address, state: point.state, area: point.area, hours: point.hours })),
      reviews: partner.reviews,
    },
    card: detail.card ? { id: detail.card.id, rows: detail.card.rows, failedAttemptFee: detail.card.failedAttemptFee, returnFee: detail.card.returnFee, notes: detail.card.notes } : null,
    privateCard: detail.privateCard ? { id: detail.privateCard.id, status: detail.privateCard.status, rows: detail.privateCard.rows, failedAttemptFee: detail.privateCard.failedAttemptFee, returnFee: detail.privateCard.returnFee, notes: detail.privateCard.notes } : null,
    stats: detail.stats,
    connection: detail.connection ? { id: detail.connection.id, services: detail.connection.services, showPartnerName: detail.connection.showPartnerName, label: detail.connection.label, ownerPod: detail.connection.ownerPod, partnerPod: detail.connection.partnerPod } : null,
  });
});
