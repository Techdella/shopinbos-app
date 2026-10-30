import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { PeggyVoiceError, VOICE_CALLS_PER_DAY, noCallsLeftMessage, peggyCallsLeftFor, startPeggyCall } from "@/lib/ai/peggy-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/peggy-call → { signedUrl, dynamicVariables }: start a free voice call with Peggy (setup help).
export const POST = withAuth(async (_req, { user }) => {
  if (!(await checkRateLimitShared(rateLimitKey("peggy-call", user.id), { maxRequests: VOICE_CALLS_PER_DAY, windowMs: 86_400_000 })).allowed) {
    return apiError("RATE_LIMITED", "You've called Peggy a few times today. Chat with her below, or message us on WhatsApp.", 429);
  }
  // Free plans: {FREE_PEGGY_CALLS_PER_MONTH} calls a month (shared/plans.ts).
  if ((await peggyCallsLeftFor(user.id)) === 0) return apiError("PLAN_LIMIT", noCallsLeftMessage(false), 402);
  try {
    return ok(await startPeggyCall(user.id));
  } catch (error) {
    if (error instanceof PeggyVoiceError) return apiError("UNAVAILABLE", error.message, 503);
    console.error("[peggy-call]", error);
    return apiError("UNAVAILABLE", "Couldn't reach Peggy just now. Try again in a minute.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
