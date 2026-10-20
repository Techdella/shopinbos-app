import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { cachedPublic, PUBLIC_DETAIL_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_DETAIL_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { PUBLIC_MARKET_SELECT, withMarketFields } from "@/lib/api/public-logistics";
import { statsForPartners } from "@/lib/delivery-market/manage.server";
import { readRateRows } from "@shared/delivery-market";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const partner = await cachedPublic(`logistics:detail:${slug}`, PUBLIC_DETAIL_TTL_S, async () => {
    const row = await db.logisticsPartner.findFirst({
      where: {
        slug,
        status: "active",
        verificationStatus: "verified",
      },
      select: {
        id: true,
        companyName: true,
        displayName: true,
        slug: true,
        description: true,
        logoUrl: true,
        country: true,
        city: true,
        coverageZones: true,
        vehicleTypes: true,
        deliveryTypes: true,
        pricingModel: true,
        basePrice: true,
        estimatedSpeed: true,
        rating: true,
        ratingCount: true,
        reliabilityScore: true,
        createdAt: true,
        ...PUBLIC_MARKET_SELECT,
        // The full public rate card and the pickup points (no phone numbers on the public API).
        rateCards: { where: { ownerUserId: null, status: "active" }, orderBy: { createdAt: "desc" }, take: 1, select: { rows: true, failedAttemptFee: true, returnFee: true, notes: true } },
        pickupPoints: { where: { active: true }, orderBy: [{ state: "asc" }, { name: "asc" }], select: { name: true, address: true, state: true, area: true, hours: true } },
      },
    });
    if (!row) return null;
    const card = row.rateCards[0] ?? null;
    const stats = (await statsForPartners([row.id])).get(row.id) ?? { completed: 0, onTimeRate: null, failedRate: null };
    return {
      ...withMarketFields(row),
      rateCard: card ? { rows: readRateRows(card.rows), failedAttemptFee: card.failedAttemptFee, returnFee: card.returnFee, notes: card.notes } : null,
      pickupPoints: row.pickupPoints,
      stats,
    };
  });

  if (!partner) {
    return withCors(req, apiError("NOT_FOUND", "Logistics partner not found", 404));
  }

  return withCors(req, ok(partner), { cacheControl: PUBLIC_DETAIL_CACHE });
}
