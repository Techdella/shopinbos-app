import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { queueLifecycleFor } from "@/lib/lifecycle/run.server";

const LogisticsModerationSchema = z.object({
  action: z.enum(["approve", "reject", "suspend", "activate"]),
  reliabilityScore: z.number().int().min(0).max(100).optional(),
});

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = LogisticsModerationSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { action, reliabilityScore } = parsed.data;
  const data =
    action === "approve"
      ? { verificationStatus: "verified" as const, status: "active", ...(reliabilityScore !== undefined ? { reliabilityScore } : {}) }
      : action === "reject"
        ? { verificationStatus: "rejected" as const }
        : action === "suspend"
          ? { verificationStatus: "suspended" as const, status: "suspended" }
          : { status: "active" };

  const partner = await db.logisticsPartner.update({
    where: { id },
    data,
    select: {
      id: true,
      displayName: true,
      slug: true,
      verificationStatus: true,
      status: true,
      reliabilityScore: true,
      updatedAt: true,
    },
  }).catch(() => null);

  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);

  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  if (action === "approve" || action === "reject") queueLifecycleFor({ logisticsPartnerId: partner.id }); // verified / not approved email
  return ok(partner);
});
