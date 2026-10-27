import { NextRequest } from "next/server";
import { isValidEmail } from "@shared/phone";
import { getAuthRouteClient } from "@/lib/auth/session.server";
import { clearAuthFailures, consumeAuthLimit, lockedForSeconds, recordAuthFailure } from "@/lib/auth/throttle";
import { clientIp, deviceCookie, logAuthEvent, recordSignIn } from "@/lib/auth/events";
import { authError, authJson, rateLimited } from "@/lib/auth/responses";
import { accountFor, noAccountMessage } from "@/lib/auth/account-lookup.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Email + password sign-in, done on the server so it can be rate-limited, locked after repeated wrong
// passwords and logged. Supabase's session cookies are written on this response.

/** Same words whether the email is unconfirmed or the password is wrong (an unknown email says "sign up first"). */
const NO_MATCH = "That email and password don't match. Try again or use a code.";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!isValidEmail(email) || !password) return authError("BAD_REQUEST", "Enter your email and password.");
  if (password.length > 200) return authError("INVALID_CREDENTIALS", NO_MATCH, 400);

  const locked = await lockedForSeconds(email);
  if (locked) return rateLimited(locked, "wrong passwords");
  const wait = await consumeAuthLimit("login", clientIp(request), email);
  if (wait) return rateLimited(wait);

  if ((await accountFor({ email })) === null) {
    await logAuthEvent(request, { type: "login_failure", method: "password", detail: { reason: "unknown_identifier" } });
    return authError("NO_ACCOUNT", noAccountMessage(false), 404);
  }

  try {
    const supabase = await getAuthRouteClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      if (error && (error.status ?? 0) >= 500) {
        return authError("UNAVAILABLE", "We could not reach the sign-in service. Check your connection and try again.", 503);
      }
      const lockedNow = await recordAuthFailure(email);
      await logAuthEvent(request, { type: lockedNow ? "login_locked" : "login_failure", method: "password" });
      if (lockedNow) return rateLimited(lockedNow, "wrong passwords");
      return authError("INVALID_CREDENTIALS", NO_MATCH, 400);
    }

    await clearAuthFailures(email);
    const deviceId = await recordSignIn(request, data.user, "password");
    const response = authJson({ accessToken: data.session?.access_token ?? null });
    const device = deviceCookie(deviceId);
    response.cookies.set(device.name, device.value, device.options);
    return response;
  } catch (error) {
    console.error("Password sign-in failed", error);
    return authError("UNAVAILABLE", "We could not reach the sign-in service. Check your connection and try again.", 503);
  }
}
