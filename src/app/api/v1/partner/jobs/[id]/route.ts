import { ok, apiError } from "@/lib/api/response";
import { withPartnerKey } from "@/lib/logistics/api-keys";
import { getPartnerJob } from "@/lib/logistics/partner-api";

// GET /v1/partner/jobs/{id}

export const dynamic = "force-dynamic";

export const GET = withPartnerKey<{ id: string }>(async (_req, { partner, params }) => {
  const job = await getPartnerJob(partner.id, params.id);
  return job ? ok(job) : apiError("NOT_FOUND", "Job not found.", 404);
});
