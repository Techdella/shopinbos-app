import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { isAppRequest } from "@/lib/app-session.server";
import { creditsUrlFor } from "@shared/ai-credits";
import { PeggyCallCreditsError, PeggyVoiceError, VOICE_CALLS_PER_DAY, peggyCallQuote, peggyVoiceReady, startPeggyCall } from "@/lib/ai/peggy-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Call Peggy" on the web (shared/peggy-call-limits.ts has the rules).
//   GET  → { ready, mode, callsLeft, maxSeconds, perMinute, hold, balance }: the terms of the next call (free plans:
//          3 free calls a Lagos month, then AI credits by the minute; every free-plan call up to 10 minutes).
//   POST → { signedUrl, dynamicVariables, callRef, maxSeconds, mode, callsLeft, perMinute, heldCredits }: start one.
//          A call paid with credits holds 10 minutes' worth now; POST ./end settles it. No credits: 402
//          AI_CREDITS_NEEDED (the page's out-of-credits prompt; pages the phone app opened get no buy link).
export const GET = withAuth(async (_req, { user }) => {
  const quote = await peggyCallQuote(user.id);
  return ok({ ready: peggyVoiceReady(), mode: quote.mode, callsLeft: quote.callsLeft === null ? null : quote.mode === "free" ? quote.callsLeft + 1 : 0, maxSeconds: quote.maxSeconds, perMinute: quote.perMinute, hold: quote.hold, balance: quote.balance });
}, ["seller", "supplier", "logistics_partner"]);

export const POST = withAuth(async (req, { user }) => {
  if (!(await checkRateLimitShared(rateLimitKey("peggy-call", user.id), { maxRequests: VOICE_CALLS_PER_DAY, windowMs: 86_400_000 })).allowed) {
    return apiError("RATE_LIMITED", "You've called Peggy a few times today. Chat with her below, or message us on WhatsApp.", 429);
  }
  const inApp = isAppRequest(req.headers);
  try {
    return ok(await startPeggyCall(user.id, { inApp }));
  } catch (error) {
    if (error instanceof PeggyCallCreditsError) {
      return NextResponse.json(
        { error: { code: "AI_CREDITS_NEEDED", message: error.message, ...(inApp ? {} : { buyUrl: creditsUrlFor(user.role) }), cost: error.cost, balance: error.balance } },
        { status: 402 },
      );
    }
    if (error instanceof PeggyVoiceError) return apiError("UNAVAILABLE", error.message, 503);
    console.error("[peggy-call]", error);
    return apiError("UNAVAILABLE", "Couldn't reach Peggy just now. Try again in a minute.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
