import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { POD_LOCKED_CODE, endConnection, partnerSetPod } from "@/lib/delivery-market/manage.server";
import { partnerFor } from "../../_guard";

export const dynamic = "force-dynamic";

// PATCH /api/mobile/logistics/market/connections/[id] { pod: boolean }: the partner's side of pay on delivery for one
// business (it shows at checkout only when both sides switch it on; not verified: 403 pod_locked). DELETE ends
// the connection.
export const PATCH = withLogistics(async (req: NextRequest, { user, params }) => {
  const found = await partnerFor(user.id, "verified");
  if ("error" in found) return found.error;
  const body = (await req.json().catch(() => null)) as { pod?: unknown } | null;
  if (typeof body?.pod !== "boolean") return apiError("BAD_REQUEST", "Say whether to offer pay on delivery.");
  const result = await partnerSetPod(found.partner.id, String(params.id), body.pod);
  if (!result.ok) return result.code === POD_LOCKED_CODE ? apiError(POD_LOCKED_CODE, result.error, 403) : apiError("BAD_REQUEST", result.error);
  return ok({ pod: body.pod });
});

export const DELETE = withLogistics(async (_req: NextRequest, { user, params }) => {
  const found = await partnerFor(user.id, "verified");
  if ("error" in found) return found.error;
  const result = await endConnection({ userId: user.id, side: "partner", partnerId: found.partner.id }, String(params.id));
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ ended: true });
});
