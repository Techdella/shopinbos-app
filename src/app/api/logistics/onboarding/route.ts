import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { LogisticsOnboardingSchema } from "@/lib/schemas";
import { coverageStateCount, logisticsCoverageLimitMessage, logisticsPlanLimits } from "@/lib/plan-limits";
import type { AuthUser } from "@/lib/auth/types";
import { PARTNER_TERMS_VERSION } from "@shared/partner-tiers";
import { reachOf, suggestedRateRows } from "@shared/delivery-market";
import { savePartnerCoverage, savePublicRateCard } from "@/lib/delivery-market/manage.server";
import { approveSignupContacts } from "@/lib/logistics/partner-kyc.server";

// GET: the set-up so far (also what the phone reads to open the step it stopped on).
// PATCH: saves set-up. Each step can be saved on its own (only what's sent changes); "completed" finishes it and,
// with pickupAreas/deliveryAreas/services/starterRates, puts the partner on the marketplace in the same call.

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
      termsVersion: true,
      pickupAreas: true,
      deliveryAreas: true,
      services: true,
    },
  });

  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);
  return ok({ ...partner, termsCurrent: partner.termsVersion === PARTNER_TERMS_VERSION });
});

export const PATCH = withLogistics(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = LogisticsOnboardingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid coverage details");
  }

  const data = parsed.data;
  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  const coverageLimit = logisticsPlanLimits(dbUser ?? {}).coverageStates;
  if (coverageLimit !== null && data.coverageZones && coverageStateCount(data.coverageZones, data.coverageMap) > coverageLimit) {
    return apiError("PLAN_LIMIT", logisticsCoverageLimitMessage(coverageLimit), 402);
  }

  // Saved step by step: anything not sent keeps what's stored.
  const zones = data.coverageZones ?? partner.coverageZones;
  const vehicles = data.vehicleTypes ?? partner.vehicleTypes;
  const deliveryTypes = data.deliveryTypes ?? partner.deliveryTypes;
  const now = new Date().toISOString();
  const activeZoneCount = (data.coverageMap?.zones ?? []).filter((zone) => zone.active).length || zones.length;
  const onboardingState = {
    source: "logistics-onboarding",
    completed: data.completed,
    readinessScore: Math.min(100, activeZoneCount * 20 + vehicles.length * 10 + deliveryTypes.length * 10),
    submittedAt: data.completed ? now : undefined,
    updatedAt: now,
  };

  if (data.country || data.city) {
    await db.user.update({
      where: { id: user.id },
      data: {
        country: data.country ?? user.country,
        city: data.city ?? user.city,
      },
    });
  }

  const updated = await db.logisticsPartner.update({
    where: { id: partner.id },
    data: {
      displayName: data.displayName ?? partner.displayName,
      // The business name typed in set-up is the company's name too (until verified; CAC has its own name).
      ...(data.displayName && partner.verificationStatus !== "verified" ? { companyName: data.displayName } : {}),
      // Who to call about a job: the account's own name and phone, so set-up never asks for them again.
      ...(!partner.contactName && user.name ? { contactName: user.name.slice(0, 80) } : {}),
      ...(!partner.contactPhone && user.phone ? { contactPhone: user.phone.slice(0, 40) } : {}),
      country: data.country ?? partner.country,
      city: data.city ?? partner.city,
      description: data.description ?? partner.description,
      coverageZones: zones,
      ...(data.coverageMap ? { coverageMap: data.coverageMap as Prisma.InputJsonValue } : {}),
      vehicleTypes: vehicles,
      deliveryTypes,
      pricingModel: data.pricingModel ?? partner.pricingModel,
      basePrice: data.basePrice ?? partner.basePrice,
      estimatedSpeed: data.estimatedSpeed ?? partner.estimatedSpeed,
      onboardingState: onboardingState as Prisma.InputJsonValue,
      verificationStatus: partner.verificationStatus === "verified" ? "verified" : data.completed ? "pending" : "unverified",
      reliabilityScore: Math.max(partner.reliabilityScore, Math.min(100, onboardingState.readinessScore)),
      // The partner terms: accepted here when a set-up sends them, else at verification's Review step (the Tier 1
      // checklist needs them before anything goes for review).
      ...(data.acceptTerms ? { termsVersion: PARTNER_TERMS_VERSION, termsAcceptedAt: new Date() } : {}),
    },
  });

  if (data.completed) {
    // The short set-up: where they pick up and deliver goes on the marketplace in the same call, a first rate card at
    // typical prices (changed any time on Rates) when there's none, and the phone and email they signed up with
    // count for verification. Every other verification check stays where it was.
    if (data.pickupAreas?.length && data.deliveryAreas?.length) {
      const saved = await savePartnerCoverage(partner.id, {
        services: data.services?.length ? data.services : partner.services.length ? partner.services : ["doorstep"],
        pickupAreas: data.pickupAreas,
        deliveryAreas: data.deliveryAreas,
        offersPayOnDelivery: partner.offersPayOnDelivery,
      });
      if (!saved.ok) return apiError("BAD_REQUEST", saved.error);
    }
    const home = data.pickupAreas?.[0] ?? zones[0];
    if (data.starterRates && home) {
      const hasCard = await db.logisticsRateCard.count({ where: { logisticsPartnerId: partner.id, ownerUserId: null, status: "active" } });
      if (!hasCard) {
        const reach = reachOf(home, data.deliveryAreas ?? [home]);
        await savePublicRateCard(partner.id, { rows: suggestedRateRows({ home, reach: reach.reach, states: reach.states, services: data.services }) });
      }
    }
    await approveSignupContacts(partner.id, user.supabaseId).catch(() => null);
  }

  invalidatePublicMarketplaceCache({ logisticsSlug: updated.slug });
  return ok(updated);
});
