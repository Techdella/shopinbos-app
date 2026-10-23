import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/middleware";
import { narrationReady, narrationUrl, sceneNarration } from "@/lib/learn/narration.server";
import { isNarrationLocale } from "@shared/intro-narration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/learn/narration?intro=<key>&scene=<1-5>&lang=<en|pcm|yo|ha|ig> → { data: { url, text } }
// The narrator's clip for one scene of a 60-second intro (made once, then served from storage). 503 when no voice
// service is set up: the player then uses the browser's own voice.
export const GET = withAuth(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const lang = params.get("lang") ?? "en";
  const scene = Number(params.get("scene"));
  if (!isNarrationLocale(lang) || !Number.isInteger(scene)) return apiError("VALIDATION_ERROR", "Say which intro, scene and language.", 422);
  const text = sceneNarration(params.get("intro") ?? "", scene, lang);
  if (!text) return apiError("NOT_FOUND", "There's no such intro scene.", 404);
  if (!narrationReady()) return apiError("SERVICE_UNAVAILABLE", "Narration isn't switched on.", 503);
  try {
    const url = await narrationUrl(params.get("intro")!, scene, lang, text);
    return NextResponse.json({ data: { url, text } }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    console.error("[intro narration] failed", error instanceof Error ? error.message : error);
    return apiError("SERVICE_UNAVAILABLE", "The narrator isn't available right now.", 503);
  }
});
