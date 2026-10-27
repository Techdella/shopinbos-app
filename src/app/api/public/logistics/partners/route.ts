import { NextRequest } from "next/server";
import { featuredPartnerIds, markFeatured } from "@/lib/plans/extras.server";
import { PARTNER_PLAN_FIRST } from "@/lib/plans/placement";
import { db } from "@/lib/db/client";
import { cachedPublic, publicCacheKey, PUBLIC_LIST_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_LIST_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { okList, apiError } from "@/lib/api/response";
import { PublicLogisticsQuerySchema } from "@/lib/schemas";
import { payWhenItArrivesWhere } from "@/lib/logistics/payin-deadline";
import { PUBLIC_MARKET_SELECT, deliveryTokensForState, withMarketFields } from "@/lib/api/public-logistics";

const select = {
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
  // Logistics marketplace: services, coverage, pay on delivery, rate card "from" price, pickup points.
  ...PUBLIC_MARKET_SELECT,
} as const;

function logisticsOrderBy(sort: "reliability" | "rating" | "newest" | "price_low" | "price_high") {
  switch (sort) {
    case "rating":
      return { rating: "desc" as const };
    case "newest":
      return { createdAt: "desc" as const };
    case "price_low":
      return { basePrice: "asc" as const };
    case "price_high":
      return { basePrice: "desc" as const };
    default:
      return [PARTNER_PLAN_FIRST, { reliabilityScore: "desc" as const }];
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const parsed = PublicLogisticsQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query"));
  }

  const { page, limit, sort, country, city, zone, vehicleType, q, cod, service, state, badge } = parsed.data;
  const skip = (page - 1) * limit;
  // ?state=Lagos: partners whose delivery areas cover the whole state (Nationwide, its region, or the state).
  const stateTokens = state ? deliveryTokensForState(state) : null;
  if (state && !stateTokens) {
    return withCors(req, apiError("BAD_REQUEST", `We don't know the state "${state}". Use a Nigerian state name, e.g. Lagos or FCT.`));
  }

  const where = {
    status: "active" as const,
    verificationStatus: "verified" as const,
    // Not partners paused for money long overdue (src/lib/money-owed).
    user: { debtPausedAt: null },
    // ?cod=true: for pay-when-it-arrives deliveries, skip partners paused for a late cash pay-in.
    ...payWhenItArrivesWhere(cod === "true" || cod === "1"),
    ...(country ? { country } : {}),
    ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    ...(zone ? { coverageZones: { has: zone } } : {}),
    ...(vehicleType ? { vehicleTypes: { has: vehicleType } } : {}),
    ...(service ? { services: { has: service } } : {}),
    ...(badge ? { badges: { has: badge } } : {}),
    ...(stateTokens ? { deliveryAreas: { hasSome: stateTokens } } : {}),
    ...(q ? {
      OR: [
        { companyName: { contains: q, mode: "insensitive" as const } },
        { displayName: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const { total, partners } = await cachedPublic(publicCacheKey("logistics:list", parsed.data), PUBLIC_LIST_TTL_S, async () => {
    const [total, partners] = await Promise.all([
      db.logisticsPartner.count({ where }),
      db.logisticsPartner.findMany({
        where,
        select,
        orderBy: logisticsOrderBy(sort),
        skip,
        take: limit,
      }),
    ]);
    const shaped = partners.map(withMarketFields);
    return { total, partners: sort === "reliability" ? markFeatured(shaped, await featuredPartnerIds(parsed.data.zone ?? null)) : shaped };
  });

  return withCors(req, okList(partners, { page, limit, total }), { cacheControl: PUBLIC_LIST_CACHE });
}
