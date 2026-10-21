import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { respondToPrivateRateCard } from "@/lib/delivery-market/manage.server";
import { withOwner } from "../../_shared";

export const dynamic = "force-dynamic";

// POST /api/mobile/delivery/rate-cards/[id] { accept: boolean }: a partner's private rates for this business.
// Accepted rates price new orders only; declining keeps their public rates.
export const POST = withOwner(async (req: NextRequest, { user, params }) => {
  const body = (await req.json().catch(() => null)) as { accept?: unknown } | null;
  if (typeof body?.accept !== "boolean") return apiError("BAD_REQUEST", "Say whether you accept these rates.");
  const result = await respondToPrivateRateCard(user.id, String(params.id), body.accept);
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ accepted: body.accept });
});
