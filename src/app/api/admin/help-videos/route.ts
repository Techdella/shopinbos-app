import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { isMissingTable } from "@/lib/rate-limit-core";
import { HELP_VIDEO_SELECT, HelpVideoInput, helpVideoLinkProblem } from "@/lib/help-videos.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/help-videos — every help video, drafts included (admin only).
export const GET = withAdmin(async () => {
  try {
    const data = await db.helpVideo.findMany({ orderBy: [{ topic: "asc" }, { language: "asc" }], select: HELP_VIDEO_SELECT });
    return NextResponse.json({ data, meta: { page: 1, limit: data.length, total: data.length } });
  } catch (error) {
    if (isMissingTable(error)) return apiError("MIGRATION_NEEDED", "Run docs/migrations/2026-10-18-help-videos.sql first.", 503);
    throw error;
  }
});

// POST /api/admin/help-videos — add a video for a topic and language (one per pair).
export const POST = withAdmin(async (req: NextRequest) => {
  const parsed = HelpVideoInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form.", 422);
  const problem = await helpVideoLinkProblem(parsed.data);
  if (problem) return apiError("INVALID_VIDEO", problem, 422);
  try {
    const data = await db.helpVideo.create({ data: parsed.data, select: HELP_VIDEO_SELECT });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return apiError("DUPLICATE", "There's already a video for that topic in that language. Edit that one instead.", 409);
    if (isMissingTable(error)) return apiError("MIGRATION_NEEDED", "Run docs/migrations/2026-10-18-help-videos.sql first.", 503);
    throw error;
  }
});
