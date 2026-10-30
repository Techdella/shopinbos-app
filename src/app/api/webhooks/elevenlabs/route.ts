import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { readCallLength, readPostCall, verifyElevenLabsSignature } from "@/lib/ai/elevenlabs-webhook";
import { settleFromWebhook } from "@/lib/ai/peggy-voice.server";
import { savePeggyNote } from "@/lib/onboarding/peggy-notes.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webhooks/elevenlabs: ElevenLabs' post-call webhook (set it in the ElevenLabs dashboard → Agents →
// Settings → Post-call webhook, URL https://app.shopinbos.com/api/webhooks/elevenlabs, with HMAC on; put its secret
// in ELEVENLABS_WEBHOOK_SECRET). After a "Call Peggy" call, its English summary of the call is kept with the
// person's Peggy call notes for the team, and a call paid with AI credits is settled to the minute (the rest of its
// hold given back). Optional: without the secret every delivery is refused (calls are then settled from the app's
// end-of-call report, checked against ElevenLabs' conversation API, or by the hourly sweep).
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyElevenLabsSignature(raw, req.headers.get("elevenlabs-signature"), process.env.ELEVENLABS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bad signature." } }, { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  // A call paid with AI credits: keep the minutes ElevenLabs measured, give the rest of the 10-minute hold back.
  const length = readCallLength(payload);
  if (length) await settleFromWebhook(length).catch((error) => console.error("[elevenlabs-webhook] settle", error));
  const call = readPostCall(payload);
  if (!call) return NextResponse.json({ ok: true });
  const user = await db.user.findUnique({ where: { id: call.userId }, select: { id: true, role: true } }).catch(() => null);
  if (user) {
    await savePeggyNote({ userId: user.id, role: user.role, text: call.summary, kind: "summary", conversationId: call.conversationId, via: "elevenlabs" }).catch((error) => console.error("[elevenlabs-webhook] note", error));
  }
  return NextResponse.json({ ok: true });
}
