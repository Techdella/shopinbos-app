import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { endPeggyCall } from "@/lib/ai/peggy-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/peggy-call/end { callRef, conversationId? } → { settled, minutes?, charged?, refunded? }
// The web call and the phone app's call (Bearer) say a call ended. The length is read from ElevenLabs, never taken
// from the app; a call paid with credits keeps its started minutes and gets the rest of the 10-minute hold back.
// When ElevenLabs is still finishing the call, the post-call webhook (or the hourly sweep) settles it instead.
const Body = z.object({ callRef: z.string().min(1).max(64), conversationId: z.string().max(120).nullable().optional() });

export const POST = withAuth(async (req, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Which call?", 400);
  try {
    return ok(await endPeggyCall(user.id, parsed.data));
  } catch (error) {
    console.error("[peggy-call] end", error);
    return ok({ settled: false });
  }
}, ["seller", "supplier", "logistics_partner"]);
