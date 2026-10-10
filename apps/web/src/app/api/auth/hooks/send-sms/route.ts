import { otpSendersFromEnv, sendOtp } from '@shopinbos/integrations/otp';
import { verifyStandardWebhook, WebhookVerificationError } from '@shopinbos/integrations/webhooks';
import { maskPhone } from '@shopinbos/validation';
import { NextResponse } from 'next/server';

interface SendSmsPayload {
  user: { id: string; phone: string };
  sms: { otp: string };
}

const hookError = (status: number, message: string) =>
  NextResponse.json({ error: { http_code: status, message } }, { status });

/**
 * Supabase Auth "Send SMS" hook. Supabase signs the request (Standard Webhooks);
 * we deliver the code on WhatsApp first, then SMS (Termii).
 * Configure in Supabase: Auth → Hooks → Send SMS → HTTPS → {APP_URL}/api/auth/hooks/send-sms
 */
export async function POST(req: Request) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET;
  if (!secret) return hookError(500, 'Hook secret not configured');

  const body = await req.text();
  let payload: SendSmsPayload;
  try {
    payload = await verifyStandardWebhook<SendSmsPayload>({ secret, body, headers: req.headers });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return hookError(401, 'Invalid signature');
    return hookError(400, 'Bad payload');
  }

  const to = payload.user.phone.startsWith('+') ? payload.user.phone : `+${payload.user.phone}`;
  const senders = otpSendersFromEnv();

  if (senders.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      console.info(
        `[send-sms] dev mode, no provider configured. Code for ${maskPhone(to)}: ${payload.sms.otp}`,
      );
      return NextResponse.json({});
    }
    return hookError(500, 'No OTP channel configured');
  }

  try {
    const result = await sendOtp(senders, { to, code: payload.sms.otp });
    console.info(
      `[send-sms] sent to ${maskPhone(to)} via ${result.channel}${result.failed.length ? ` (failed: ${result.failed.join(',')})` : ''}`,
    );
    return NextResponse.json({});
  } catch (err) {
    console.error(
      `[send-sms] all channels failed for ${maskPhone(to)}`,
      err instanceof Error ? err.message : err,
    );
    return hookError(502, 'Could not deliver the code');
  }
}
