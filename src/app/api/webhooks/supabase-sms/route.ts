import { NextRequest, NextResponse } from "next/server";
import { verifySvixSignature } from "@/lib/inbox/pure";
import { e164 } from "@/lib/sms/pure";
import { deliverSignInCode } from "@/lib/auth/otp-delivery.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase Auth "Send SMS" hook: Supabase makes the sign-in code and calls this instead of an SMS provider of its
// own, and we send it with the platform's Termii / Africa's Talking / Sendchamp account (SMS_PROVIDER order, with
// failover). Requests are signed the Standard Webhooks way (webhook-id, webhook-timestamp, webhook-signature)
// with SUPABASE_SEND_SMS_HOOK_SECRET ("v1,whsec_…" from Auth → Hooks). scripts/configure-supabase-auth.mjs
// switches the hook on. Supabase always asks for SMS; the channel the person chose is noted by /api/auth/otp, and
// deliverSignInCode sends on WhatsApp (Termii or Sendchamp, when AUTH_OTP_WHATSAPP=1) with SMS as the fallback
// (src/lib/auth/otp-channel.ts). Twilio is never used.

function hookError(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.SUPABASE_SEND_SMS_HOOK_SECRET?.replace(/^v1,/, "");
  if (!secret) return hookError(503, "SMS sign-in codes aren't set up on this server.");
  const raw = await req.text();
  const signed = verifySvixSignature(
    { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
    raw,
    secret,
  );
  if (!signed) return hookError(401, "Invalid signature");

  let payload: { user?: { phone?: string }; sms?: { otp?: string } } = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return hookError(400, "Invalid JSON");
  }
  const phone = e164(payload.user?.phone);
  const otp = payload.sms?.otp?.replace(/\D/g, "");
  if (!phone || !otp) return hookError(400, "No phone number or code in the request.");

  const sent = await deliverSignInCode(phone, otp);
  if (!sent.ok) {
    console.error("[supabase-sms] couldn't send a sign-in code", sent.error);
    return hookError(502, "We couldn't send the code. Try again or use email.");
  }
  return NextResponse.json({}, { status: 200 });
}
