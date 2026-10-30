import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { endPeggyCall, userFromCallToken } from "@/lib/ai/peggy-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/peggy-call/end { t, callRef, conversationId? }: the same as /api/app/peggy-call/end, for
// /call-peggy opened from the phone app with its 15-minute token.
const Body = z.object({ t: z.string().min(1).max(400), callRef: z.string().min(1).max(64), conversationId: z.string().max(120).nullable().optional() });

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const userId = parsed.success ? userFromCallToken(parsed.data.t) : null;
  if (!parsed.success || !userId) return apiError("UNAUTHORIZED", "This call link has expired. Open it again from the app.", 401);
  try {
    return ok(await endPeggyCall(userId, { callRef: parsed.data.callRef, conversationId: parsed.data.conversationId }));
  } catch (error) {
    console.error("[peggy-call] public end", error);
    return ok({ settled: false });
  }
}
