import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { withPartnerKey } from "@/lib/logistics/api-keys";
import { ProofBody, firstIssue, getPartnerJob, readJson } from "@/lib/logistics/partner-api";

// PATCH /v1/partner/jobs/{id}/proof — attach a proof-of-delivery photo (an https URL your system hosts).

export const dynamic = "force-dynamic";

export const PATCH = withPartnerKey<{ id: string }>(async (req, { partner, params }) => {
  const parsed = ProofBody.safeParse(await readJson(req));
  if (!parsed.success) return apiError("BAD_REQUEST", firstIssue(parsed.error));

  const updated = await db.deliveryBooking.updateMany({
    where: { id: params.id, logisticsPartnerId: partner.id, status: { notIn: ["pending", "cancelled"] } },
    data: { proofUrl: parsed.data.photoUrl },
  });
  if (updated.count === 0) {
    const job = await getPartnerJob(partner.id, params.id);
    return job ? apiError("CONFLICT", `A ${job.status} job can't take a proof photo.`, 409) : apiError("NOT_FOUND", "Job not found.", 404);
  }
  return ok(await getPartnerJob(partner.id, params.id));
});
