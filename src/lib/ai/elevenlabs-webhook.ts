// ElevenLabs' post-call webhook for "Call Peggy" calls: checking its HMAC signature and reading the call summary.
// The header is `ElevenLabs-Signature: t=<unix seconds>,v0=<hex HMAC-SHA256 of "<t>.<raw body>">`, signed with the
// webhook's secret (ELEVENLABS_WEBHOOK_SECRET). Unit-tested in tests/peggy-call.test.mjs.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Signatures older than this are refused (replays). */
export const WEBHOOK_TOLERANCE_SECONDS = 30 * 60;

export function verifyElevenLabsSignature(rawBody: string, header: string | null | undefined, secret: string | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  const signature = parts.v0;
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Who the call was with (the user_ref dynamic variable we start every call with) and ElevenLabs' summary. */
export function readPostCall(payload: unknown): { userId: string; conversationId: string | null; summary: string } | null {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  if (body?.type !== "post_call_transcription") return null;
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  const init = data.conversation_initiation_client_data && typeof data.conversation_initiation_client_data === "object" ? (data.conversation_initiation_client_data as Record<string, unknown>) : {};
  const vars = init.dynamic_variables && typeof init.dynamic_variables === "object" ? (init.dynamic_variables as Record<string, unknown>) : {};
  const analysis = data.analysis && typeof data.analysis === "object" ? (data.analysis as Record<string, unknown>) : {};
  const userId = typeof vars.user_ref === "string" ? vars.user_ref.trim() : "";
  const summary = typeof analysis.transcript_summary === "string" ? analysis.transcript_summary.trim() : "";
  if (!userId || !summary) return null;
  return { userId, conversationId: typeof data.conversation_id === "string" ? data.conversation_id : null, summary: summary.slice(0, 4000) };
}

/**
 * How long a call lasted, as ElevenLabs measured it (data.metadata.call_duration_secs), and which call it was
 * (the call_ref and user_ref dynamic variables we start every call with). For settling calls paid with credits
 * (src/lib/ai/peggy-voice.server.ts settleFromWebhook); doesn't need a summary.
 */
export function readCallLength(payload: unknown): { userId: string; callRef: string | null; conversationId: string | null; seconds: number | null } | null {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  if (body?.type !== "post_call_transcription") return null;
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  const init = data.conversation_initiation_client_data && typeof data.conversation_initiation_client_data === "object" ? (data.conversation_initiation_client_data as Record<string, unknown>) : {};
  const vars = init.dynamic_variables && typeof init.dynamic_variables === "object" ? (init.dynamic_variables as Record<string, unknown>) : {};
  const metadata = data.metadata && typeof data.metadata === "object" ? (data.metadata as Record<string, unknown>) : {};
  const userId = typeof vars.user_ref === "string" ? vars.user_ref.trim() : "";
  if (!userId) return null;
  const seconds = typeof metadata.call_duration_secs === "number" && Number.isFinite(metadata.call_duration_secs) ? Math.max(0, metadata.call_duration_secs) : null;
  return {
    userId,
    callRef: typeof vars.call_ref === "string" && vars.call_ref.trim() ? vars.call_ref.trim() : null,
    conversationId: typeof data.conversation_id === "string" ? data.conversation_id : null,
    seconds,
  };
}
