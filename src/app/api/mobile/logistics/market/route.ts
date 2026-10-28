import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { POD_LOCKED_CODE, connectionsForPartner, rateCardsForPartner, savePartnerBusiness, savePartnerCoverage, savePublicRateCard, statsForPartners } from "@/lib/delivery-market/manage.server";
import { canOfferPayOnDelivery } from "@shared/dropship-rules";
import { partnerFor, rateInput } from "./_guard";

export const dynamic = "force-dynamic";

// The delivery partner's side of the logistics marketplace in the phone app (Business tab and set-up).
// GET → company details, coverage and services, the public rate card, pickup points, connected businesses (with
// private rates sent to them), and in-app stats. `partner.level` (verified | trusted | cash_trusted) and
// `partner.podOpen` say whether pay on delivery can be switched on (Cash trusted, not paused for late cash); the
// goals to get there are GET /api/mobile/logistics/level.
// PUT { section: "coverage", services, pickupAreas, deliveryAreas, offersPayOnDelivery }   offersPayOnDelivery: true
//     below Cash trusted is refused: 403 { error: { code: "pod_locked", message } }
//     { section: "business", companyName?, cacNumber, contactName, contactPhone, contactEmail, address }
//     { section: "rates", rows, failedAttemptFee, returnFee, notes }   publishes a new public rate card
export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const found = await partnerFor(user.id, "any");
  if ("error" in found) return found.error;
  const { partner } = found;
  const [cards, points, connections, stats] = await Promise.all([
    rateCardsForPartner(partner.id),
    db.logisticsPickupPoint.findMany({ where: { logisticsPartnerId: partner.id, active: true }, orderBy: [{ state: "asc" }, { name: "asc" }] }),
    connectionsForPartner(partner.id),
    statsForPartners([partner.id]).then((map) => map.get(partner.id) ?? null),
  ]);
  return ok({
    partner: {
      id: partner.id,
      slug: partner.slug,
      name: partner.displayName,
      companyName: partner.companyName,
      cacNumber: partner.cacNumber,
      contactName: partner.contactName,
      contactPhone: partner.contactPhone,
      contactEmail: partner.contactEmail,
      address: partner.address,
      verificationStatus: partner.verificationStatus,
      rating: partner.rating,
      ratingCount: partner.ratingCount,
      services: partner.services,
      pickupAreas: partner.pickupAreas,
      deliveryAreas: partner.deliveryAreas,
      offersPayOnDelivery: partner.offersPayOnDelivery,
      level: partner.level,
      podOpen: canOfferPayOnDelivery(partner),
    },
    rateCard: cards.publicCard ? { id: cards.publicCard.id, rows: cards.publicCard.rows, failedAttemptFee: cards.publicCard.failedAttemptFee, returnFee: cards.publicCard.returnFee, notes: cards.publicCard.notes, createdAt: cards.publicCard.createdAt } : null,
    pickupPoints: points.map((point) => ({ id: point.id, name: point.name, address: point.address, state: point.state, area: point.area, hours: point.hours, phone: point.phone, lat: point.lat, lng: point.lng })),
    connections: connections.map((connection) => ({
      id: connection.id,
      ownerUserId: connection.ownerUserId,
      ownerRole: connection.ownerRole,
      businessName: connection.businessName,
      ownerPod: connection.ownerPod,
      partnerPod: connection.partnerPod,
      createdAt: connection.createdAt,
      privateCards: connection.privateCards,
    })),
    stats,
  });
});

export const PUT = withLogistics(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const section = body?.section;
  // Business details can be filled in during set-up; coverage and rates need set-up done.
  const found = await partnerFor(user.id, section === "business" ? "any" : "setup");
  if ("error" in found) return found.error;
  const { partner } = found;
  if (!body) return apiError("BAD_REQUEST", "Nothing to save.");
  if (section === "coverage") {
    const result = await savePartnerCoverage(partner.id, {
      services: body.services,
      pickupAreas: body.pickupAreas,
      deliveryAreas: body.deliveryAreas,
      offersPayOnDelivery: body.offersPayOnDelivery === true,
    });
    if (!result.ok) return result.code === POD_LOCKED_CODE ? apiError(POD_LOCKED_CODE, result.error, 403) : apiError("BAD_REQUEST", result.error);
    return ok({ saved: true, unknown: result.data?.unknown ?? [] });
  }
  if (section === "business") {
    const result = await savePartnerBusiness(partner.id, { companyName: body.companyName, cacNumber: body.cacNumber, contactName: body.contactName, contactPhone: body.contactPhone, contactEmail: body.contactEmail, address: body.address });
    if (!result.ok) return apiError("BAD_REQUEST", result.error);
    return ok({ saved: true });
  }
  if (section === "rates") {
    const result = await savePublicRateCard(partner.id, rateInput(body));
    if (!result.ok) return apiError("BAD_REQUEST", result.error);
    return ok({ saved: true });
  }
  return apiError("BAD_REQUEST", "Choose what to save.");
});
