import { business } from '@shopinbos/config/business';
import { limit } from '@shopinbos/integrations/ratelimit';
import { otpStartSchema } from '@shopinbos/validation';
import { fail, handler, ok, parseJson } from '@/lib/api/respond';
import { clientIp, counters } from '@/lib/ratelimit';
import { supabaseStateless } from '@/lib/supabase/server';

/**
 * POST /api/auth/otp/start { phone } | { email }
 * Phone: Supabase calls our Send SMS hook, which delivers on WhatsApp with SMS fallback.
 * Always answers the same way, so it never reveals whether an account exists.
 */
export const POST = handler(async (req: Request) => {
  const input = await parseJson(req, otpStartSchema);
  const id = 'phone' in input ? input.phone : input.email;

  const perId = await limit(
    counters(),
    `otp:start:${id}`,
    business.auth.otpStartsPerMinute.value,
    60,
  );
  const perIp = await limit(counters(), `otp:start-ip:${clientIp(req)}`, 30, 60);
  if (!perId.allowed || !perIp.allowed)
    return fail('RATE_LIMITED', 'Too many codes asked for. Wait a minute and try again.');

  const supabase = supabaseStateless();
  const { error } =
    'phone' in input
      ? await supabase.auth.signInWithOtp({
          phone: input.phone,
          options: { shouldCreateUser: true },
        })
      : await supabase.auth.signInWithOtp({
          email: input.email,
          options: { shouldCreateUser: true },
        });

  if (error) {
    if (error.status === 429)
      return fail('RATE_LIMITED', 'Too many codes asked for. Wait a minute and try again.');
    console.error('[otp/start] supabase error', error.status, error.code);
    return fail('UPSTREAM_FAILED', "We couldn't send your code. Try again in a moment.");
  }
  return ok({ sent: true as const });
});
