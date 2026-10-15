import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { AD_REQUEST_STATUSES } from "@shared/ad-campaigns";

export const dynamic = "force-dynamic";

const Schema = z.object({ status: z.enum(AD_REQUEST_STATUSES).optional(), adminNotes: z.string().trim().max(4000).nullable().optional() });

// /admin/ad-requests: move a request along (in progress, live, done) and keep notes the seller doesn't see.
export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Check the status.");
  const row = await db.adServiceRequest.findUnique({ where: { id }, select: { id: true, campaignId: true } });
  if (!row) return apiError("NOT_FOUND", "Request not found", 404);
  const updated = await db.adServiceRequest.update({ where: { id }, data: parsed.data });
  // The seller's campaign follows the team's progress.
  if (row.campaignId && parsed.data.status) {
    const status = parsed.data.status === "live" ? "running" : parsed.data.status === "done" || parsed.data.status === "cancelled" ? "ended" : null;
    if (status) await db.adCampaign.update({ where: { id: row.campaignId }, data: { status, ...(status === "running" ? { startedAt: new Date() } : {}) } }).catch(() => null);
  }
  return ok(updated);
});
