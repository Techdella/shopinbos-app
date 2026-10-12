// Limits for sign-in, codes and password resets. Pure so the numbers are tested and shared.

export interface WindowLimit {
  limit: number;
  windowMs: number;
}

const MINUTE = 60_000;

/** Requests allowed per IP address and per email/phone, whatever the outcome. */
export const AUTH_LIMITS = {
  login: { ip: { limit: 30, windowMs: 15 * MINUTE }, identifier: { limit: 10, windowMs: 15 * MINUTE } },
  otpSend: { ip: { limit: 12, windowMs: 15 * MINUTE }, identifier: { limit: 5, windowMs: 15 * MINUTE } },
  otpVerify: { ip: { limit: 40, windowMs: 15 * MINUTE }, identifier: { limit: 15, windowMs: 15 * MINUTE } },
  passwordReset: { ip: { limit: 6, windowMs: 60 * MINUTE }, identifier: { limit: 3, windowMs: 60 * MINUTE } },
  passwordChange: { ip: { limit: 20, windowMs: 15 * MINUTE }, identifier: { limit: 8, windowMs: 15 * MINUTE } },
} satisfies Record<string, { ip: WindowLimit; identifier: WindowLimit }>;

export type AuthAction = keyof typeof AUTH_LIMITS;

/** Wrong passwords or codes in a row before an account is paused. */
export const FAILURES_BEFORE_LOCK = 5;

/** Lock grows with repeated failures: 5 wrong → 5 min, 8 → 15 min, 10+ → 1 hour. */
export function lockoutMs(failures: number) {
  if (failures < FAILURES_BEFORE_LOCK) return 0;
  if (failures < 8) return 5 * MINUTE;
  if (failures < 10) return 15 * MINUTE;
  return 60 * MINUTE;
}

export function retryAfterSeconds(until: Date | number, now = Date.now()) {
  return Math.max(1, Math.ceil(((typeof until === "number" ? until : until.getTime()) - now) / 1000));
}

/** "Too many attempts. Try again in 5 minutes." */
export function tryAgainMessage(seconds: number, what = "attempts") {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many ${what}. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** Throttle keys never hold the raw email or phone: callers hash the identifier first. */
export function normaliseIdentifier(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : trimmed.replace(/[^\d+]/g, "");
}
