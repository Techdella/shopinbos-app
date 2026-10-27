import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { findPartners } from "@/lib/delivery-market/manage.server";
import { PARTNER_SERVICES } from "@shared/delivery-market";
import { isPartnerBadge } from "@shared/partner-tiers";
import { text, withOwner } from "../_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/delivery/partners?service=&state=&q=&pickupPoints=1&badge=: "Find partners", verified partners that pick
// up where the business ships from and cover where it sells, best first, with "from" price, time and stats.
export const GET = withOwner(async (req: NextRequest, { user }) => {
  const params = req.nextUrl.searchParams;
  const service = text(params.get("service"), 20);
  const found = await findPartners(
    { id: user.id, role: user.role },
    {
      service: (PARTNER_SERVICES as readonly string[]).includes(service) ? service : null,
      state: text(params.get("state"), 40) || null,
      q: text(params.get("q"), 80) || null,
      pickupPoints: params.get("pickupPoints") === "1",
      badge: isPartnerBadge(params.get("badge")) ? params.get("badge") : null,
    },
  );
  return ok({
    origin: found.origin,
    sellArea: found.settings.sellArea,
    sellStates: found.settings.sellStates,
    partners: found.rows.map((row) => ({
      id: row.partner.id,
      slug: row.partner.slug,
      name: row.partner.displayName,
      logoUrl: row.partner.logoUrl,
      rating: row.partner.rating,
      ratingCount: row.partner.ratingCount,
      services: row.partner.services,
      pickupAreas: row.partner.pickupAreas,
      deliveryAreas: row.partner.deliveryAreas,
      offersPayOnDelivery: row.partner.offersPayOnDelivery,
      badges: row.partner.badges,
      deliveryMethods: row.partner.vehicleTypes,
      startingPrice: row.startingPrice,
      timeframe: row.timeframe,
      stats: row.stats,
      pickupPointCount: row.pickupPointCount,
      connectionId: row.connectionId,
    })),
  });
});
