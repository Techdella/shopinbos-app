import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { newsError } from "@/lib/email/product-news.api";
import { loadBroadcast, startBroadcast } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({ scheduledAt: z.string().datetime({ offset: true }).optional().nullable() });

// POST /api/admin/product-news/:id/send — send now (the first batches go out in this request, the cron carries on),
// or { "scheduledAt": ISO } to send later. Calling it again never sends anyone a second copy.
export const POST = withAdmin(async (req: NextRequest, { params }) => {
  const id = String(params.id);
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) return apiError("VALIDATION_ERROR", "scheduledAt must be a date and time", 422);
  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() > Date.now() + 60 * 86_400_000) return apiError("VALIDATION_ERROR", "Schedule it within the next 60 days", 422);
  try {
    const progress = await startBroadcast(id, { scheduledAt });
    const broadcast = await loadBroadcast(id);
    return NextResponse.json({ data: { broadcast, progress } });
  } catch (error) {
    return newsError(error);
  }
});
