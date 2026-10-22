import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { LogisticsPartnerUpdateSchema } from "@/lib/schemas";
import { coverageStateCount, logisticsCoverageLimitMessage, logisticsPlanLimits } from "@/lib/plan-limits";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withLogistics(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const partner = await db.logisticsPartner.findUnique({
    where: { userId: user.id },
    include: { _count: { select: { bookings: true, quoteRequests: true } } },
  });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);
  return ok(partner);
});

export const PATCH = withLogistics(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner profile not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = LogisticsPartnerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (parsed.data.coverageZones) {
    const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
    const limit = logisticsPlanLimits(dbUser ?? {}).coverageStates;
    if (limit !== null && coverageStateCount(parsed.data.coverageZones) > limit) {
      return apiError("PLAN_LIMIT", logisticsCoverageLimitMessage(limit), 402);
    }
  }

  const updated = await db.logisticsPartner.update({ where: { id: partner.id }, data: parsed.data });
  invalidatePublicMarketplaceCache({ logisticsSlug: updated.slug });
  return ok(updated);
});
