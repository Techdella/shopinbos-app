import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { getPublicEnv } from "@/lib/env";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { PeggyVoiceError, VOICE_CALLS_PER_DAY, callToken, peggyVoiceReady, startPeggyAppCall } from "@/lib/ai/peggy-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["seller", "supplier", "logistics_partner"] as const;

// "Call Peggy" in the phone app: a free voice call with Peggy that runs inside the app (ElevenLabs' React Native
// SDK, WebRTC), with tools that save to the account while she talks (POST /api/mobile/peggy-call/action).
//   GET  → { ready }: whether calls are switched on (the app hides the button when not). `url` is only for app
//          builds from before the in-app call, which opened the web call page.
//   POST → { conversationToken, dynamicVariables, maxSeconds }: start a call. Free (no AI credits), the same
//          VOICE_CALLS_PER_DAY as the web call.
export const GET = withAuth(async (_req, { user }) => {
  const base = getPublicEnv().appUrl.replace(/\/$/, "");
  return ok({ ready: peggyVoiceReady(), inApp: true, url: `${base}/call-peggy?t=${encodeURIComponent(callToken(user.id))}` });
}, [...ROLES]);

export const POST = withAuth(async (_req, { user }) => {
  if (!peggyVoiceReady()) return apiError("UNAVAILABLE", "Calls with Peggy aren't switched on yet. Chat with her instead, or message us on WhatsApp.", 503);
  if (!(await checkRateLimitShared(rateLimitKey("peggy-call", user.id), { maxRequests: VOICE_CALLS_PER_DAY, windowMs: 86_400_000 })).allowed) {
    return apiError("RATE_LIMITED", "You've called Peggy a few times today. Chat with her instead, or message us on WhatsApp.", 429);
  }
  try {
    return ok(await startPeggyAppCall(user.id));
  } catch (error) {
    if (error instanceof PeggyVoiceError) return apiError("UNAVAILABLE", error.message, 503);
    console.error("[peggy-call] mobile", error);
    return apiError("UNAVAILABLE", "Couldn't reach Peggy just now. Try again in a minute.", 503);
  }
}, [...ROLES]);
