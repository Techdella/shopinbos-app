import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { publishedHelpVideos } from "@/lib/help-videos.server";
import { HELP_VIDEO_ROLES, helpLanguage, helpVideosForRole, pickHelpVideo, topicForPath, type HelpVideoRole } from "@shared/help-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/help-videos?role=seller&path=/products/new&lang=yo — the one-minute help videos Help offers.
// Public (riders and signed-out screens have Help too) and only ever returns published videos.
//   → { data: { current: video | null, topic, all: video[] } }
//   current: the video for the screen at `path` (or `topic`), in `lang` if there is one, else English, else null
//            (Help hides "Watch a 1-minute video" then); all: one per topic for the role, for "All videos".
export async function GET(req: NextRequest) {
  const limit = checkRateLimit(`help-videos:${requestIp(req.headers)}`, { maxRequests: 120, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Wait a minute." } }, { status: 429 });

  const params = req.nextUrl.searchParams;
  const roleParam = params.get("role");
  const role = HELP_VIDEO_ROLES.some((item) => item.value === roleParam) ? (roleParam as HelpVideoRole) : null;
  const language = helpLanguage(params.get("lang"));
  const topic = params.get("topic") || topicForPath(params.get("path"), role);

  const videos = await publishedHelpVideos(role);
  const current = pickHelpVideo(videos, topic, language, role);
  const all = helpVideosForRole(videos, role, language);
  return NextResponse.json({ data: { topic: topic ?? null, current, all } }, { headers: { "Cache-Control": "private, max-age=60" } });
}
