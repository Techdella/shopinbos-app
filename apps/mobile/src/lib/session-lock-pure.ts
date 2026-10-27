// When the phone app locks or signs out after being away (components/SessionGuard.tsx). Pure, tested in
// tests/mobile-session-lock.test.mjs.
//
// The web signs out after an hour unused (web src/lib/auth/idle.ts). On the phone that would mean a new code every
// time, so instead the app locks after `lockMs` away (5 minutes; AUTH_APP_LOCK_MINUTES on the server) and opens again
// with Face ID, a fingerprint or the phone's PIN. A phone with no screen lock can't do that, so it signs out after
// the web's `idleMs` instead. Sessions also end for good after AUTH_APP_SESSION_MAX_DAYS (the server answers
// SESSION_EXPIRED and the app signs out).

export type LockDecision = "open" | "lock" | "signout";

/** Fallbacks while the server hasn't said (offline on launch). */
export const DEFAULT_LOCK_MS = 5 * 60_000;
export const DEFAULT_IDLE_MS = 60 * 60_000;

export function lockDecision(input: { awayMs: number; lockMs: number; idleMs: number; deviceSecure: boolean }): LockDecision {
  const { awayMs, lockMs, idleMs, deviceSecure } = input;
  if (!Number.isFinite(awayMs) || awayMs < 0) return "open";
  if (deviceSecure) return lockMs > 0 && awayMs >= lockMs ? "lock" : "open";
  return idleMs > 0 && awayMs >= idleMs ? "signout" : "open";
}
