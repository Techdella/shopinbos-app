import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { proposePrivateRateCard } from "@/lib/delivery-market/manage.server";
import { partnerFor, rateInput } from "../_guard";

export const dynamic = "force-dynamic";

// POST /api/mobile/logistics/market/private-rates { ownerUserId, rows, failedAttemptFee, returnFee, notes }:
// "Send them a private rate". Only that business sees it; it replaces the public price for them once they accept.
export const POST = withLogistics(async (req: NextRequest, { user }) => {
  const found = await partnerFor(user.id, "verified");
  if ("error" in found) return found.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const ownerUserId = typeof body?.ownerUserId === "string" ? body.ownerUserId.slice(0, 40) : "";
  if (!body || !ownerUserId) return apiError("BAD_REQUEST", "Pick the business to send these rates to.");
  const result = await proposePrivateRateCard(found.partner.id, ownerUserId, rateInput(body));
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ sent: true });
});
