import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { PUBLIC_LIST_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { okList, apiError } from "@/lib/api/response";
import { PublicLogisticsQuerySchema } from "@/lib/schemas";
import { payWhenItArrivesWhere } from "@/lib/logistics/payin-deadline";

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
      return { reliabilityScore: "desc" as const };
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

  const { page, limit, sort, country, city, zone, vehicleType, q, cod } = parsed.data;
  const skip = (page - 1) * limit;

  const where = {
    status: "active" as const,
    verificationStatus: "verified" as const,
    // Delivery networks (booked through their own API) aren't partners.
    ownerId: null,
    // ?cod=true: for pay-when-it-arrives deliveries, skip partners paused for a late cash pay-in.
    ...payWhenItArrivesWhere(cod === "true" || cod === "1"),
    ...(country ? { country } : {}),
    ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    ...(zone ? { coverageZones: { has: zone } } : {}),
    ...(vehicleType ? { vehicleTypes: { has: vehicleType } } : {}),
    ...(q ? {
      OR: [
        { companyName: { contains: q, mode: "insensitive" as const } },
        { displayName: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

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

  return withCors(req, okList(partners, { page, limit, total }), { cacheControl: PUBLIC_LIST_CACHE });
}
