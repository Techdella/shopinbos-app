import { okList, apiError, parsePagination } from "@/lib/api/response";
import { withPartnerKey } from "@/lib/logistics/api-keys";
import { JobListQuery, firstIssue, listPartnerJobs } from "@/lib/logistics/partner-api";

// GET /v1/partner/jobs?status=pending&page=1&limit=20 — the partner's delivery jobs, newest first.

export const dynamic = "force-dynamic";

export const GET = withPartnerKey(async (req, { partner }) => {
  const query = JobListQuery.safeParse({ status: req.nextUrl.searchParams.get("status") || undefined });
  if (!query.success) return apiError("BAD_REQUEST", firstIssue(query.error));
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const { total, jobs } = await listPartnerJobs(partner.id, { status: query.data.status, skip, take: limit });
  return okList(jobs, { page, limit, total });
});
