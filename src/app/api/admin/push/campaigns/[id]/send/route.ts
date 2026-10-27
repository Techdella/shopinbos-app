import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { lagosInputToDate } from "@shared/push-campaigns";
import { startCampaign } from "@/lib/push-campaigns/campaigns.server";
import { adminOf, pushError, readJson } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  /** "2026-11-30T09:15" in Lagos time; leave out to send now. */
  scheduledAt: z.string().max(40).optional().nullable(),
  /** Past the daily limit of real campaigns. */
  override: z.boolean().default(false),
});

// POST /api/admin/push/campaigns/:id/send — send now (the first batches go out in this request, the cron carries
// on), or { "scheduledAt": "YYYY-MM-DDTHH:mm" } (Lagos time) to send later. Needs a matching test first. Calling it
// again never sends anyone a second copy.
export const POST = withAdmin(async (req: NextRequest, { user, params }) => {
  const body = await readJson(req);
  if ("error" in body) return body.error;
  const parsed = Body.safeParse(body.data ?? {});
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Check the date and time.", 422);
  const scheduledAt = parsed.data.scheduledAt ? lagosInputToDate(parsed.data.scheduledAt) : null;
  if (parsed.data.scheduledAt && !scheduledAt) return apiError("VALIDATION_ERROR", "Pick a date and time.", 422);
  try {
    return NextResponse.json({ data: await startCampaign(String(params.id), await adminOf(user), { scheduledAt, override: parsed.data.override }) });
  } catch (error) {
    return pushError(error);
  }
});
