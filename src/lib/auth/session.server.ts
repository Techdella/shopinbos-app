import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { decodeAccessToken, isRecentRecovery, type SessionClaims } from "./session-claims";

/**
 * Session cookie flags. @supabase/ssr defaults to path=/, SameSite=Lax, and not httpOnly — on purpose: the
 * browser client reads the session from document.cookie. We add Secure in production.
 */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

/** Supabase client for /api/auth route handlers: reads and writes the session cookies with our flags. */
export async function getAuthRouteClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component render: cookies are read-only there.
        }
      },
    },
  });
}

/** A throwaway client that never touches cookies, for checking a password without replacing the session. */
export function getDetachedAuthClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

type AuthClient = Awaited<ReturnType<typeof getAuthRouteClient>>;

/** The verified user plus the claims of the session they're using, or null when signed out. */
export async function currentSession(client: AuthClient) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: sessionData } = await client.auth.getSession();
  const claims = decodeAccessToken(sessionData.session?.access_token);
  // Only trust claims that belong to the user Supabase just verified.
  return { user: data.user, claims: claims?.sub === data.user.id ? claims : null };
}

// ── Password-reset marker ────────────────────────────────────────────────────
// /auth/callback sets this after it swaps a reset-link code for a session. It's signed and tied to that
// session, so it can't be forged or carried to another session, and it's cleared once the password is set.

export const RECOVERY_COOKIE = "sib_recovery";
export const RECOVERY_MAX_AGE_MS = 60 * 60_000;

function markerSecret() {
  return process.env.AUTH_COOKIE_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sign(payload: string) {
  return createHmac("sha256", markerSecret()).update(payload).digest("base64url");
}

export function recoveryMarker(sessionId: string, now = Date.now()) {
  const payload = `${sessionId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

export function recoveryCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: RECOVERY_MAX_AGE_MS / 1000 };
}

function markerMatches(value: string | undefined, sessionId: string | undefined, now = Date.now()) {
  if (!value || !sessionId || !markerSecret()) return false;
  const [id, issued, signature] = value.split(".");
  if (!id || !issued || !signature || id !== sessionId) return false;
  if (!(Number(issued) > now - RECOVERY_MAX_AGE_MS)) return false;
  const expected = Buffer.from(sign(`${id}.${issued}`));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** True while this session came from an unused password-reset link (within the hour). */
export async function isRecoverySession(claims: SessionClaims | null) {
  if (!claims?.session_id) return false;
  const cookieStore = await cookies();
  if (markerMatches(cookieStore.get(RECOVERY_COOKIE)?.value, claims.session_id)) return true;
  // Supabase also stamps reset-link sessions with amr "recovery". A finished reset replaces the session
  // (global sign-out, then a fresh password sign-in), so this can't be replayed after use.
  return isRecentRecovery(claims, RECOVERY_MAX_AGE_MS);
}
