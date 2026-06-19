import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { computeTrustScore, getTrustScoreBreakdown, type VerificationDoc } from "@/app/actions/verification";

export const GET = withLogistics(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const [partner, dbUser] = await Promise.all([
    db.logisticsPartner.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        displayName: true,
        companyName: true,
        city: true,
        country: true,
        verificationStatus: true,
        reliabilityScore: true,
        slug: true,
        status: true,
        onboardingState: true,
        logoUrl: true,
        bannerUrl: true,
        verificationDocuments: true,
        rating: true,
        ratingCount: true,
        vehicleTypes: true,
      },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, avatarUrl: true },
    }),
  ]);

  if (!partner) return apiError("NOT_FOUND", "Partner profile not found", 404);

  const docs = (partner.verificationDocuments as VerificationDoc[]) ?? [];
  const bookingCount = await db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id } });
  const deliverySuccess = bookingCount > 0
    ? await db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "delivered" } })
    : 0;
  const deliveryRate = bookingCount > 0 ? Math.round((deliverySuccess / bookingCount) * 100) : 0;

  const trustBreakdown = getTrustScoreBreakdown({
    docs,
    productCount: partner.vehicleTypes.length,
    orderCount: bookingCount,
    rating: partner.rating,
    deliverySuccessRate: deliveryRate,
  });

  const computedScore = computeTrustScore({
    docs,
    productCount: partner.vehicleTypes.length,
    orderCount: bookingCount,
    rating: partner.rating,
    deliverySuccessRate: deliveryRate,
  });

  return ok({
    partner: {
      ...partner,
      trustScore: partner.reliabilityScore || computedScore,
      verificationDocuments: docs,
    },
    user: dbUser,
    trustBreakdown,
  });
});
