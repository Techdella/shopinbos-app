import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { notifyVerificationDecision } from "@/lib/notifications/events.server";
import { refreshPartnerTier } from "@/lib/logistics/partner-tiers.server";

// The team's decision on a whole partner. Reject and suspend need a reason (LogisticsPartner.statusReason, shown to
// the partner). "activate" reinstates a suspended partner: back to verified when they had a tier (or were verified
// before tiers), else back to pending review. "approve" keeps the old behaviour (verified, active) and may set a
// tier for partners the team checked outside the tier checklist; without one the checks decide the tier.
const LogisticsModerationSchema = z
  .object({
    action: z.enum(["approve", "reject", "suspend", "activate"]),
    reliabilityScore: z.number().int().min(0).max(100).optional(),
    reason: z.string().trim().max(500).optional(),
    tier: z.enum(["tier1", "tier2"]).optional(),
  })
  .refine((body) => (body.action !== "reject" && body.action !== "suspend") || (body.reason?.length ?? 0) >= 3, {
    message: "Give a reason. The partner sees it.",
    path: ["reason"],
  });

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = LogisticsModerationSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const current = await db.logisticsPartner.findUnique({ where: { id }, select: { verificationStatus: true, verificationTier: true, kycSubmittedAt: true } });
  if (!current) return apiError("NOT_FOUND", "Logistics partner not found", 404);

  const { action, reliabilityScore, reason, tier } = parsed.data;
  const score = reliabilityScore !== undefined ? { reliabilityScore } : {};
  // Reinstating: a partner who had a tier goes straight back to work; one who never finished goes back to review.
  const reinstateTo = current.verificationTier !== "none" ? ("verified" as const) : current.kycSubmittedAt ? ("pending" as const) : ("unverified" as const);
  const data =
    action === "approve"
      ? { verificationStatus: "verified" as const, status: "active", statusReason: null, ...(tier ? { verificationTier: tier } : {}), ...score }
      : action === "reject"
        ? { verificationStatus: "rejected" as const, statusReason: reason, ...score }
        : action === "suspend"
          ? { verificationStatus: "suspended" as const, status: "suspended", statusReason: reason, ...score }
          : current.verificationStatus === "suspended"
            ? { verificationStatus: reinstateTo, status: "active", statusReason: null, ...score }
            : { status: "active", ...score };

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
      userId: true,
    },
  }).catch(() => null);

  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);

  // Stores the tier and badges the checks earn (and may finish verifying a pending partner).
  const refreshed = await refreshPartnerTier(id);
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  const finalStatus = refreshed?.status ?? partner.verificationStatus;
  // refreshPartnerTier already told them when it moved them to verified.
  if ("verificationStatus" in data && finalStatus === partner.verificationStatus && String(current.verificationStatus) !== finalStatus) {
    await notifyVerificationDecision({ userId: partner.userId, status: finalStatus, portal: "logistics" });
  }
  return ok({ ...partner, verificationStatus: finalStatus, verificationTier: refreshed?.tier ?? tier ?? current.verificationTier, badges: refreshed?.badges ?? [] });
});
