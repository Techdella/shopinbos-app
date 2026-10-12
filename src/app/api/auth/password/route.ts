import { NextRequest } from "next/server";
import { currentSession, getAuthRouteClient, getDetachedAuthClient, isRecoverySession, RECOVERY_COOKIE } from "@/lib/auth/session.server";
import { authenticatedWithin } from "@/lib/auth/session-claims";
import { clearAuthFailures, consumeAuthLimit, lockedForSeconds, recordAuthFailure } from "@/lib/auth/throttle";
import { clientIp, logAuthEvent, sendPasswordChangedEmail } from "@/lib/auth/events";
import { authError, authJson, rateLimited } from "@/lib/auth/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sets a new password, in one of two ways:
// - From a reset link (/reset-password): the session must be the one /auth/callback made from the link.
//   Afterwards every session is signed out, including the link's own, and this browser gets a fresh
//   password session — so the link can't be used twice and other devices are logged out.
// - From Settings > Security: needs the current password, or a sign-in in the last 10 minutes for accounts
//   that only ever used codes or Google. Other devices are signed out; this one stays in.

const RECENT_SIGN_IN_MS = 10 * 60_000;

function passwordProblem(password: string) {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 72) return "Use 72 characters or fewer.";
  if (!password.trim()) return "Your password can't be only spaces.";
  return null;
}

function friendlyUpdateError(message: string) {
  if (/different from the old|same password|should be different/i.test(message)) return "Choose a password you haven't used here before.";
  if (/weak|pwned|leaked|characters/i.test(message)) return "That password is too easy to guess. Try a longer one.";
  if (/reauthenticat/i.test(message)) return "For your security, log out and back in, then set your password.";
  return "We couldn't save your password. Please try again.";
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { password?: string; currentPassword?: string } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const problem = passwordProblem(password);
  if (problem) return authError("BAD_REQUEST", problem);

  const supabase = await getAuthRouteClient();
  const session = await currentSession(supabase);
  if (!session) {
    return authError("UNAUTHORIZED", "Your reset link has expired or was already used. Ask for a new one.", 401);
  }
  const { user, claims } = session;
  const identifier = user.email ?? user.phone ?? user.id;
  const recovery = await isRecoverySession(claims);

  if (!recovery) {
    const locked = await lockedForSeconds(identifier);
    if (locked) return rateLimited(locked, "wrong passwords");
    const wait = await consumeAuthLimit("passwordChange", clientIp(request), identifier);
    if (wait) return rateLimited(wait);

    if (currentPassword) {
      if (!user.email) return authError("REAUTH_REQUIRED", "Log out and back in with a code, then set your password within 10 minutes.", 403);
      const checker = getDetachedAuthClient();
      const { data, error } = await checker.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (error || data.user?.id !== user.id) {
        const lockedNow = await recordAuthFailure(identifier);
        await logAuthEvent(request, { type: "password_change_failed", supabaseId: user.id });
        if (lockedNow) return rateLimited(lockedNow, "wrong passwords");
        return authError("WRONG_PASSWORD", "Your current password isn't right.", 400);
      }
      // Drop the session the check created; the person's own session is untouched.
      await checker.auth.signOut({ scope: "local" }).catch(() => null);
      await clearAuthFailures(identifier);
    } else if (!authenticatedWithin(claims, RECENT_SIGN_IN_MS)) {
      return authError("REAUTH_REQUIRED", "Enter your current password. No password yet? Log out and back in with a code, then set one within 10 minutes.", 403);
    }
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return authError("UPDATE_FAILED", friendlyUpdateError(error.message), 400);

  await logAuthEvent(request, { type: recovery ? "password_reset" : "password_changed", supabaseId: user.id });
  await sendPasswordChangedEmail(user.email, request, recovery ? "reset" : "changed");

  if (!recovery) {
    await supabase.auth.signOut({ scope: "others" }).catch(() => null);
    return authJson({ changed: true, signedOutOthers: true });
  }

  // Reset link: end every session (including the link's), then sign this browser back in with the new password.
  await supabase.auth.signOut({ scope: "global" }).catch(() => null);
  let signedIn = false;
  if (user.email) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password });
    signedIn = !signInError;
  }
  const response = authJson({ changed: true, signedOutOthers: true, signedIn });
  response.cookies.set(RECOVERY_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
