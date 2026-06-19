import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { computeTrustScore, getTrustScoreBreakdown, type VerificationDoc } from "@/app/actions/verification";

export const GET = withSupplier(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const [supplier, dbUser] = await Promise.all([
    db.supplier.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        displayName: true,
        businessName: true,
        city: true,
        country: true,
        verificationStatus: true,
        trustScore: true,
        slug: true,
        status: true,
        onboardingState: true,
        logoUrl: true,
        bannerUrl: true,
        verificationDocuments: true,
        rating: true,
        ratingCount: true,
        responseTime: true,
        categories: true,
        description: true,
      },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, avatarUrl: true },
    }),
  ]);

  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const docs = (supplier.verificationDocuments as VerificationDoc[]) ?? [];
  const productCount = await db.supplierProduct.count({ where: { supplierId: supplier.id } });
  const orderCount = await db.wholesaleOrder.count({ where: { supplierId: supplier.id } });
  const disputeCount = await db.supplierReview.count({
    where: { supplierId: supplier.id, status: "active", rating: { lte: 2 } },
  });

  const trustBreakdown = getTrustScoreBreakdown({
    docs,
    productCount,
    orderCount,
    rating: supplier.rating,
    responseTime: supplier.responseTime,
    disputes: disputeCount,
  });

  const computedScore = computeTrustScore({
    docs,
    productCount,
    orderCount,
    rating: supplier.rating,
    responseTime: supplier.responseTime,
    disputes: disputeCount,
  });

  return ok({
    supplier: {
      ...supplier,
      trustScore: supplier.trustScore || computedScore,
      verificationDocuments: docs,
    },
    user: dbUser,
    trustBreakdown,
  });
});
