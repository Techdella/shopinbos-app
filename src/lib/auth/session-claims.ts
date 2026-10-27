// Reads the claims Supabase puts in its access token. Only use on a token Supabase has already
// verified (auth.getUser() succeeded for the same session) — this does not check the signature.

export interface SessionClaims {
  sub?: string;
  session_id?: string;
  exp?: number;
  iat?: number;
  amr?: { method?: string; timestamp?: number }[];
}

export function decodeAccessToken(token: string | null | undefined): SessionClaims | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(part, "base64url").toString("utf8")
      : new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json) as SessionClaims;
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

/** When the person last proved who they are (password, code, Google, reset link), in ms. */
export function authenticatedAt(claims: SessionClaims | null): number | null {
  const stamps = (claims?.amr ?? []).map((entry) => Number(entry?.timestamp)).filter((value) => Number.isFinite(value) && value > 0);
  return stamps.length ? Math.max(...stamps) * 1000 : null;
}

/** True when the session came from a password-reset link within maxAgeMs. */
export function isRecentRecovery(claims: SessionClaims | null, maxAgeMs: number, now = Date.now()) {
  return (claims?.amr ?? []).some((entry) => entry?.method === "recovery" && Number(entry.timestamp) * 1000 > now - maxAgeMs);
}

export function authenticatedWithin(claims: SessionClaims | null, maxAgeMs: number, now = Date.now()) {
  const at = authenticatedAt(claims);
  return at !== null && at > now - maxAgeMs;
}

/**
 * Absolute session lifetime on the web: a week (AUTH_SESSION_MAX_DAYS), 8 hours for admins
 * (AUTH_ADMIN_SESSION_MAX_HOURS); 0 turns it off. Inactivity signs people out sooner (./idle.ts).
 */
export function sessionMaxAgeMs(role: string | null | undefined, env: Record<string, string | undefined>) {
  const days = Number(env.AUTH_SESSION_MAX_DAYS ?? 7);
  const adminHours = Number(env.AUTH_ADMIN_SESSION_MAX_HOURS ?? 8);
  if (role === "admin" && Number.isFinite(adminHours) && adminHours > 0) return adminHours * 3_600_000;
  return Number.isFinite(days) && days > 0 ? days * 86_400_000 : 0;
}

/**
 * Absolute lifetime of a phone app session (Bearer token): AUTH_APP_SESSION_MAX_DAYS, default 30; 0 turns it off.
 * Longer than the web's because the app also locks itself after a few minutes away (Face ID, fingerprint or PIN).
 */
export function appSessionMaxAgeMs(env: Record<string, string | undefined>) {
  const days = Number(env.AUTH_APP_SESSION_MAX_DAYS ?? 30);
  return Number.isFinite(days) && days > 0 ? days * 86_400_000 : 0;
}

export function sessionTooOld(claims: SessionClaims | null, maxAgeMs: number, now = Date.now()) {
  if (!maxAgeMs) return false;
  const at = authenticatedAt(claims);
  return at !== null && now - at > maxAgeMs;
}
