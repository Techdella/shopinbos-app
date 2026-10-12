import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { HELP_VIDEO_SELECT, HelpVideoInput, helpVideoLinkProblem, removeHelpFile } from "@/lib/help-videos.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/help-videos/:id — save changes (the whole form). DELETE — remove it and its uploaded files.
export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const id = String(params.id ?? "");
  const existing = await db.helpVideo.findUnique({ where: { id }, select: HELP_VIDEO_SELECT });
  if (!existing) return apiError("NOT_FOUND", "That video isn't there any more.", 404);
  const parsed = HelpVideoInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form.", 422);
  // Only re-check links that changed (an unchanged upload was checked when it was first saved).
  const problem = parsed.data.published && !parsed.data.videoUrl
    ? "Add a video (upload one or paste a link) before publishing."
    : await helpVideoLinkProblem({
        published: false,
        videoUrl: parsed.data.videoUrl !== existing.videoUrl ? parsed.data.videoUrl : null,
        posterUrl: parsed.data.posterUrl !== existing.posterUrl ? parsed.data.posterUrl : null,
      });
  if (problem) return apiError("INVALID_VIDEO", problem, 422);
  try {
    const data = await db.helpVideo.update({ where: { id }, data: parsed.data, select: HELP_VIDEO_SELECT });
    if (existing.videoUrl !== data.videoUrl) await removeHelpFile(existing.videoUrl);
    if (existing.posterUrl !== data.posterUrl) await removeHelpFile(existing.posterUrl);
    return NextResponse.json({ data });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return apiError("DUPLICATE", "There's already a video for that topic in that language.", 409);
    throw error;
  }
});

export const DELETE = withAdmin(async (_req: NextRequest, { params }) => {
  const id = String(params.id ?? "");
  const existing = await db.helpVideo.findUnique({ where: { id }, select: HELP_VIDEO_SELECT });
  if (!existing) return apiError("NOT_FOUND", "That video isn't there any more.", 404);
  await db.helpVideo.delete({ where: { id } });
  await Promise.all([removeHelpFile(existing.videoUrl), removeHelpFile(existing.posterUrl)]);
  return NextResponse.json({ data: { id } });
});
