import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { withPartnerKey } from "@/lib/logistics/api-keys";
import { assignRider, transitionJob } from "@/lib/logistics/jobs";
import { AcceptBody, firstIssue, getPartnerJob, readJson } from "@/lib/logistics/partner-api";

// POST /v1/partner/jobs/{id}/accept — take an offered job (pending → confirmed), optionally naming the rider.

export const dynamic = "force-dynamic";

export const POST = withPartnerKey<{ id: string }>(async (req, { partner, params }) => {
  const parsed = AcceptBody.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return apiError("BAD_REQUEST", firstIssue(parsed.error));

  const { riderId } = parsed.data;
  if (riderId) {
    const rider = await db.logisticsTeamMember.findFirst({ where: { id: riderId, logisticsPartnerId: partner.id, status: "active" }, select: { id: true } });
    if (!rider) return apiError("BAD_REQUEST", "riderId: pick an active rider on your team.");
  }

  const moved = await transitionJob({ bookingId: params.id, partnerId: partner.id, to: "confirmed", actor: "api" });
  if (!moved.ok) return moved.error === "Job not found." ? apiError("NOT_FOUND", moved.error, 404) : apiError("CONFLICT", moved.error, 409);

  if (riderId) {
    const assigned = await assignRider({ bookingId: params.id, partnerId: partner.id, riderId });
    if (!assigned.ok) return apiError("UNPROCESSABLE_ENTITY", `Accepted, but the rider wasn't assigned: ${assigned.error}`);
  }
  return ok(await getPartnerJob(partner.id, params.id));
});
