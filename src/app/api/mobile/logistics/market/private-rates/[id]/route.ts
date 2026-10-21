import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { withdrawPrivateRateCard } from "@/lib/delivery-market/manage.server";
import { partnerFor } from "../../_guard";

export const dynamic = "force-dynamic";

// DELETE /api/mobile/logistics/market/private-rates/[id]: withdraw private rates sent to a business.
export const DELETE = withLogistics(async (_req: NextRequest, { user, params }) => {
  const found = await partnerFor(user.id, "verified");
  if ("error" in found) return found.error;
  const result = await withdrawPrivateRateCard(found.partner.id, String(params.id));
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ withdrawn: true });
});
