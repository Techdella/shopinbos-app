import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { PeggyVoiceError, VOICE_CALLS_PER_DAY, startPeggyCall, userFromCallToken } from "@/lib/ai/peggy-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/peggy-call { t }: the same call, for /call-peggy opened from the mobile app with a 15-minute token
// (the browser isn't signed in there).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { t?: unknown };
  const userId = typeof body.t === "string" ? userFromCallToken(body.t) : null;
  if (!userId) return apiError("UNAUTHORIZED", "This call link has expired. Open it again from the app.", 401);
  if (!(await checkRateLimitShared(rateLimitKey("peggy-call", userId), { maxRequests: VOICE_CALLS_PER_DAY, windowMs: 86_400_000 })).allowed) {
    return apiError("RATE_LIMITED", "You've called Peggy a few times today. Message us on WhatsApp instead.", 429);
  }
  try {
    return ok(await startPeggyCall(userId));
  } catch (error) {
    if (error instanceof PeggyVoiceError) return apiError("UNAVAILABLE", error.message, 503);
    console.error("[peggy-call] public", error);
    return apiError("UNAVAILABLE", "Couldn't reach Peggy just now. Try again in a minute.", 503);
  }
}
