import { business } from '@shopinbos/config/business';
import { otpVerifySchema } from '@shopinbos/validation';
import { fail, handler, ok, parseJson } from '@/lib/api/respond';
import { counters } from '@/lib/ratelimit';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * POST /api/auth/otp/verify { phone|email, code }
 * Sets the web session cookie and returns tokens (mobile apps store them in secure storage).
 * Locks after 5 wrong codes for 15 minutes (SPEC 14).
 */
export const POST = handler(async (req: Request) => {
  const input = await parseJson(req, otpVerifySchema);
  const id = 'phone' in input ? input.phone : input.email;
  const failKey = `otp:fail:${id}`;
  const store = counters();

  const { otpMaxFailedAttempts: max, otpLockMinutes: lockMin } = business.auth;
  if ((await store.get(failKey)) >= max.value) {
    return fail('LOCKED', `Too many wrong codes. Try again in ${lockMin.value} minutes.`);
  }

  const supabase = await supabaseServer();
  const { data, error } =
    'phone' in input
      ? await supabase.auth.verifyOtp({ phone: input.phone, token: input.code, type: 'sms' })
      : await supabase.auth.verifyOtp({ email: input.email, token: input.code, type: 'email' });

  if (error || !data.session) {
    const attempts = await store.hit(failKey, lockMin.value * 60);
    if (attempts >= max.value)
      return fail('LOCKED', `Too many wrong codes. Try again in ${lockMin.value} minutes.`);
    return fail('INVALID_CODE', "That code didn't work. Check it or ask for a new one.");
  }

  await store.reset(failKey);
  const s = data.session;
  return ok({
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ?? 0,
  });
});
