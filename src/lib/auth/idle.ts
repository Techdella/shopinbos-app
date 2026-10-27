// Inactivity sign-out for the web portals. Pure (Web Crypto only), so the proxy and tests share it.
//
// The proxy keeps a signed, httpOnly "last active" cookie for each signed-in browser session: `<session>.<seconds>.<sig>`.
// Real activity moves it on: a page opened (not a prefetch), anything that writes, and the heartbeat the page sends
// while someone is typing or clicking (components/auth/IdleSignOut.tsx → /api/auth/activity). Background polling
// (GET on the portal APIs) never does, so a tab left open still runs out. Past the limit the proxy signs the browser
// out and sends pages to the login with ?reason=idle (APIs answer 401 SESSION_EXPIRED).
//
// Env: AUTH_IDLE_MINUTES (sellers, suppliers, delivery partners; default 60) and AUTH_ADMIN_IDLE_MINUTES (default 15);
// 0 turns it off. The cookie is signed with AUTH_ACTIVITY_SECRET (else JWT_SECRET, else the service role key).
// The phone app signs in with a Bearer token and never passes through here.

export const ACTIVITY_COOKIE = "sib_active";
export const ACTIVITY_PATH = "/api/auth/activity";

export function idleTimeoutMs(role: string | null | undefined, env: Record<string, string | undefined>) {
  const minutes = Number(role === "admin" ? env.AUTH_ADMIN_IDLE_MINUTES ?? 15 : env.AUTH_IDLE_MINUTES ?? 60);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
}

export function activitySecret(env: Record<string, string | undefined>) {
  return env.AUTH_ACTIVITY_SECRET?.trim() || env.JWT_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
}

function base64url(bytes: ArrayBuffer) {
  let text = "";
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`idle:${payload}`))).slice(0, 32);
}

/** Session ids are uuids; anything else (a user id fallback) is reduced to the same safe characters. */
const sessionPart = (session: string) => session.replace(/[^\w-]/g, "").slice(0, 64);

export async function activityCookieValue(session: string, at: number, secret: string) {
  const payload = `${sessionPart(session)}.${Math.floor(at / 1000)}`;
  return `${payload}.${await sign(payload, secret)}`;
}

/** When this session was last active, from the cookie; null when it's missing, forged or another session's. */
export async function lastActiveAt(value: string | null | undefined, session: string, secret: string): Promise<number | null> {
  const [id, seconds, signature, extra] = (value ?? "").split(".");
  if (!id || !seconds || !signature || extra !== undefined || id !== sessionPart(session) || !/^\d{1,12}$/.test(seconds)) return null;
  const expected = await sign(`${id}.${seconds}`, secret);
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0 ? Number(seconds) * 1000 : null;
}

/** A missing cookie (just signed in, or opened from the phone app) starts the clock now. */
export function idleExpired(lastActive: number | null, timeoutMs: number, now = Date.now()) {
  return Boolean(timeoutMs) && lastActive !== null && now - lastActive > timeoutMs;
}

/**
 * Does this request show the person is there? Pages they open (not Next's prefetches) and writes do; GETs on the
 * APIs (polling, background refreshes) don't. The heartbeat is a POST, so it counts.
 */
export function countsAsActivity(input: { method: string; isApi: boolean; headers: { get(name: string): string | null } }) {
  const method = input.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return true;
  if (input.isApi) return false;
  const prefetch = input.headers.get("next-router-prefetch") || /prefetch/i.test(input.headers.get("purpose") ?? "") || /prefetch/i.test(input.headers.get("sec-purpose") ?? "");
  return !prefetch;
}

/** Writing the cookie at most once a minute keeps responses small; a minute is nothing against the limit. */
export function shouldRefreshActivity(lastActive: number | null, now = Date.now()) {
  return lastActive === null || now - lastActive >= 60_000;
}
