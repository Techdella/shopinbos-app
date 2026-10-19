import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { LogisticsOnboardingSchema } from "@/lib/schemas";
import { LOGISTICS_FREE_ROUTE_LIMIT, isProPlan, logisticsRouteLimitMessage } from "@/lib/plan-limits";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withLogistics(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const partner = await db.logisticsPartner.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      companyName: true,
      displayName: true,
      country: true,
      city: true,
      description: true,
      logoUrl: true,
      coverageZones: true,
      coverageMap: true,
      vehicleTypes: true,
      deliveryTypes: true,
      pricingModel: true,
      basePrice: true,
      estimatedSpeed: true,
      verificationStatus: true,
      reliabilityScore: true,
      onboardingState: true,
    },
  });

  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);
  return ok(partner);
});

export const PATCH = withLogistics(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = LogisticsOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid coverage details");
  }

  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  if (!isProPlan(dbUser ?? {}) && parsed.data.coverageZones.length > LOGISTICS_FREE_ROUTE_LIMIT) {
    return apiError("PLAN_LIMIT", logisticsRouteLimitMessage(), 402);
  }

  const now = new Date().toISOString();
  const activeZoneCount = parsed.data.coverageMap.zones.filter((zone) => zone.active).length || parsed.data.coverageZones.length;
  const onboardingState = {
    source: "logistics-onboarding",
    completed: parsed.data.completed,
    readinessScore: Math.min(100, activeZoneCount * 20 + parsed.data.vehicleTypes.length * 10 + parsed.data.deliveryTypes.length * 10),
    submittedAt: parsed.data.completed ? now : undefined,
    updatedAt: now,
  };

  if (parsed.data.country || parsed.data.city) {
    await db.user.update({
      where: { id: user.id },
      data: {
        country: parsed.data.country ?? user.country,
        city: parsed.data.city ?? user.city,
      },
    });
  }

  const updated = await db.logisticsPartner.update({
    where: { id: partner.id },
    data: {
      displayName: parsed.data.displayName ?? partner.displayName,
      country: parsed.data.country ?? partner.country,
      city: parsed.data.city ?? partner.city,
      description: parsed.data.description ?? partner.description,
      coverageZones: parsed.data.coverageZones,
      coverageMap: parsed.data.coverageMap as Prisma.InputJsonValue,
      vehicleTypes: parsed.data.vehicleTypes,
      deliveryTypes: parsed.data.deliveryTypes,
      pricingModel: parsed.data.pricingModel,
      basePrice: parsed.data.basePrice,
      estimatedSpeed: parsed.data.estimatedSpeed ?? partner.estimatedSpeed,
      onboardingState: onboardingState as Prisma.InputJsonValue,
      verificationStatus: partner.verificationStatus === "verified" ? "verified" : parsed.data.completed ? "pending" : "unverified",
      reliabilityScore: Math.max(partner.reliabilityScore, Math.min(100, onboardingState.readinessScore)),
    },
  });

  invalidatePublicMarketplaceCache({ logisticsSlug: updated.slug });
  return ok(updated);
});
