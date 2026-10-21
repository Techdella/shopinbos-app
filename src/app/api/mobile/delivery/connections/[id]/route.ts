import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { endConnection, updateConnection } from "@/lib/delivery-market/manage.server";
import { text, withOwner } from "../../_shared";

export const dynamic = "force-dynamic";

// PATCH /api/mobile/delivery/connections/[id] { services?, showPartnerName?, label?, ownerPod?, acceptPodDisclaimer? }:
// "Delivery settings" for one partner: what customers can choose, what checkout calls it, pay on delivery (both
// sides must opt in, and the business accepts the disclaimer). DELETE ends the connection; jobs already sent carry on.
export const PATCH = withOwner(async (req: NextRequest, { user, params }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return apiError("BAD_REQUEST", "Choose what to change.");
  const result = await updateConnection(user.id, String(params.id), {
    services: Array.isArray(body.services) ? body.services.map((value) => text(value, 20)) : undefined,
    showPartnerName: typeof body.showPartnerName === "boolean" ? body.showPartnerName : undefined,
    label: body.label === undefined ? undefined : text(body.label, 40),
    ownerPod: typeof body.ownerPod === "boolean" ? body.ownerPod : undefined,
    acceptPodDisclaimer: body.acceptPodDisclaimer === true,
  });
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ saved: true });
});

export const DELETE = withOwner(async (_req: NextRequest, { user, params }) => {
  const result = await endConnection({ userId: user.id, side: "owner" }, String(params.id));
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  return ok({ ended: true });
});
