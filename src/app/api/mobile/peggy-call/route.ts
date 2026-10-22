import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { getPublicEnv } from "@/lib/env";
import { callToken, peggyVoiceReady } from "@/lib/ai/peggy-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mobile/peggy-call → { url, ready }: the app opens url (in the phone's browser) for a voice call with
// Peggy. The link signs them in for this call only and expires in 15 minutes.
export const GET = withAuth(async (_req, { user }) => {
  const base = getPublicEnv().appUrl.replace(/\/$/, "");
  return ok({ ready: peggyVoiceReady(), url: `${base}/call-peggy?t=${encodeURIComponent(callToken(user.id))}` });
}, ["seller", "supplier", "logistics_partner"]);
