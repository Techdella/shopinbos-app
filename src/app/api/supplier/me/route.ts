import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

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
      },
    }),
    db.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, avatarUrl: true },
    }),
  ]);

  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  return ok({ supplier, user: dbUser });
});
