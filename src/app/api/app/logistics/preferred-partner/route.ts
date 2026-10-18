import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

const PreferredPartnerSchema = z.object({
  logisticsPartnerId: z.string(),
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = PreferredPartnerSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const partner = await db.logisticsPartner.findFirst({
    where: {
      id: parsed.data.logisticsPartnerId,
      status: "active",
      verificationStatus: "verified",
      ownerId: null,
    },
    select: { id: true, displayName: true, slug: true },
  });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, brandSettings: true },
  });
  if (!store) return apiError("NOT_FOUND", "Store not found. Complete onboarding first.", 404);

  const brandSettings = {
    ...(store.brandSettings as Record<string, unknown>),
    logistics: {
      ...((store.brandSettings as { logistics?: Record<string, unknown> }).logistics ?? {}),
      preferredPartnerId: partner.id,
    },
  };

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings },
  });

  return ok({ preferredPartner: partner });
});
