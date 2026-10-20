import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { withPartnerKey } from "@/lib/logistics/api-keys";
import { transitionJob } from "@/lib/logistics/jobs";
import { StatusBody, firstIssue, getPartnerJob, readJson } from "@/lib/logistics/partner-api";

// PATCH /v1/partner/jobs/{id}/status — picked_up → in_transit → out_for_delivery (doorstep) or at_pickup_point
// (pickup points) → delivered (with the buyer's code) or failed (with a reason); failed → returning → returned. Pay-on-delivery jobs report what was collected and how: { cod: { amount, method: "cash" | "transfer" } }.

export const dynamic = "force-dynamic";

export const PATCH = withPartnerKey<{ id: string }>(async (req, { partner, params }) => {
  const parsed = StatusBody.safeParse(await readJson(req));
  if (!parsed.success) return apiError("BAD_REQUEST", firstIssue(parsed.error));
  const body = parsed.data;

  if (body.trackingCode) {
    const taken = await db.deliveryBooking.findFirst({ where: { trackingCode: body.trackingCode, id: { not: params.id } }, select: { id: true } });
    if (taken) return apiError("CONFLICT", "trackingCode is already used by another job.", 409);
  }

  const moved = await transitionJob({
    bookingId: params.id,
    partnerId: partner.id,
    to: body.status,
    actor: "api",
    code: body.code,
    failedReason: body.reason,
    codCollected: body.cod?.amount,
    codMethod: body.cod?.method,
    trackingCode: body.trackingCode,
  });
  if (!moved.ok) return moved.error === "Job not found." ? apiError("NOT_FOUND", moved.error, 404) : apiError("UNPROCESSABLE_ENTITY", moved.error);
  return ok(await getPartnerJob(partner.id, params.id));
});
