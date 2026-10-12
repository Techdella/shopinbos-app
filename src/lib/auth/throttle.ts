import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { checkRateLimitShared } from "@/lib/rate-limit";
import { AUTH_LIMITS, lockoutMs, normaliseIdentifier, retryAfterSeconds, type AuthAction, type WindowLimit } from "./throttle-policy";

// Rate limits and lockouts for the auth endpoints. Request windows go through the shared limiter
// (checkRateLimitShared, Postgres "RateLimitBucket", fail closed); failure counts and account locks are kept in
// "AuthThrottle". Both are in Postgres so every serverless instance sees the same counts.

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function throttleKeys(action: AuthAction, ip: string | null, identifier: string | null) {
  return {
    ip: ip ? `${action}:ip:${sha256(ip)}` : null,
    identifier: identifier ? `${action}:id:${sha256(normaliseIdentifier(identifier))}` : null,
  };
}

/** Accounts are locked per identifier across actions, so a lock from wrong codes also stops password guesses. */
export function lockKey(identifier: string) {
  return `lock:id:${sha256(normaliseIdentifier(identifier))}`;
}

const memoryFailures = new Map<string, { failures: number; lockedUntil: number; updatedAt: number }>();

/**
 * One request against a window, in the shared limiter (memory gate, then Postgres "RateLimitBucket"). Fails
 * closed: if the database can't count, sign-in, codes and resets wait rather than letting guesses through
 * (a missing table before the migration falls back to memory instead; see rate-limit-core.ts).
 */
async function bump(key: string, rule: WindowLimit): Promise<{ allowed: boolean; retryAfter: number }> {
  const result = await checkRateLimitShared(`auth:${key}`, { maxRequests: rule.limit, windowMs: rule.windowMs, failClosed: true });
  return { allowed: result.allowed, retryAfter: result.allowed ? 0 : retryAfterSeconds(result.resetAt) };
}

/**
 * Counts one request against the IP and identifier windows for this action.
 * Returns the wait in seconds when either is over its limit, otherwise 0.
 */
export async function consumeAuthLimit(action: AuthAction, ip: string | null, identifier: string | null) {
  const keys = throttleKeys(action, ip, identifier);
  const limits = AUTH_LIMITS[action];
  const results = await Promise.all([
    keys.ip ? bump(keys.ip, limits.ip) : null,
    keys.identifier ? bump(keys.identifier, limits.identifier) : null,
  ]);
  return Math.max(0, ...results.map((result) => (result && !result.allowed ? result.retryAfter : 0)));
}

/** Seconds left on an account lock after repeated wrong passwords or codes, or 0. */
export async function lockedForSeconds(identifier: string | null) {
  if (!identifier) return 0;
  const key = lockKey(identifier);
  try {
    const rows = await db.$queryRaw<{ lockedUntil: Date | null }[]>`SELECT "lockedUntil" FROM "AuthThrottle" WHERE "key" = ${key}`;
    const until = rows[0]?.lockedUntil ? new Date(rows[0].lockedUntil).getTime() : 0;
    return until > Date.now() ? retryAfterSeconds(until) : 0;
  } catch {
    const entry = memoryFailures.get(key);
    return entry && entry.lockedUntil > Date.now() ? retryAfterSeconds(entry.lockedUntil) : 0;
  }
}

/** Records a wrong password or code. Returns the lock in seconds when this failure triggered one. */
export async function recordAuthFailure(identifier: string | null) {
  if (!identifier) return 0;
  const key = lockKey(identifier);
  try {
    // Failures older than a day are forgiven.
    const rows = await db.$queryRaw<{ failures: number }[]>`
      INSERT INTO "AuthThrottle" ("key", "failures", "updatedAt")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "failures" = CASE WHEN "AuthThrottle"."updatedAt" < now() - interval '1 day' THEN 1 ELSE "AuthThrottle"."failures" + 1 END,
        "updatedAt" = now()
      RETURNING "failures"`;
    const failures = Number(rows[0]?.failures ?? 0);
    const ms = lockoutMs(failures);
    if (!ms) return 0;
    const until = new Date(Date.now() + ms);
    await db.$executeRaw`UPDATE "AuthThrottle" SET "lockedUntil" = ${until} WHERE "key" = ${key}`;
    return retryAfterSeconds(until);
  } catch {
    const now = Date.now();
    const previous = memoryFailures.get(key);
    const failures = previous && previous.updatedAt > now - 86_400_000 ? previous.failures + 1 : 1;
    const ms = lockoutMs(failures);
    memoryFailures.set(key, { failures, lockedUntil: ms ? now + ms : 0, updatedAt: now });
    return ms ? retryAfterSeconds(now + ms) : 0;
  }
}

/** A correct password or code clears the failure count. */
export async function clearAuthFailures(identifier: string | null) {
  if (!identifier) return;
  const key = lockKey(identifier);
  memoryFailures.delete(key);
  await db.$executeRaw`UPDATE "AuthThrottle" SET "failures" = 0, "lockedUntil" = NULL, "updatedAt" = now() WHERE "key" = ${key}`.catch(() => null);
}
