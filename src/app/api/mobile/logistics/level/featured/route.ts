import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { applyToBeFeatured } from "@/lib/logistics/partner-reach.server";
import { partnerForUser } from "../../_shared";

export const dynamic = "force-dynamic";

// POST /api/mobile/logistics/level/featured: a Top partner (Tier 3) applies to be featured → { status: "applied" }.
// 409 FEATURED when they can't (not a Top partner yet, already applied or already featured), with the reason.
export const POST = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const result = await applyToBeFeatured(partner.id);
  if (!result.ok) return apiError("FEATURED", result.error, 409);
  return ok({ status: result.status });
});
