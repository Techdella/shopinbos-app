import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { cachedPublic, PUBLIC_DETAIL_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_DETAIL_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const partner = await cachedPublic(`logistics:detail:${slug}`, PUBLIC_DETAIL_TTL_S, () =>
    db.logisticsPartner.findFirst({
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
      },
    }),
  );

  if (!partner) {
    return withCors(req, apiError("NOT_FOUND", "Logistics partner not found", 404));
  }

  return withCors(req, ok(partner), { cacheControl: PUBLIC_DETAIL_CACHE });
}
