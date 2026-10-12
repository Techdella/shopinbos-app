import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUTH_LIMITS, lockoutMs, normaliseIdentifier, retryAfterSeconds, type AuthAction, type WindowLimit } from "./throttle-policy";

// Rate limits and lockouts for the auth endpoints, kept in Postgres ("AuthThrottle") so every serverless
// instance sees the same counts. Before the migration runs (or if the database is unreachable) it falls
// back to per-instance memory, which still slows a single attacker down.

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

type Row = { count: number; windowStart: Date; lockedUntil: Date | null };

async function bump(key: string, rule: WindowLimit): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const seconds = Math.ceil(rule.windowMs / 1000);
    const rows = await db.$queryRaw<Row[]>`
      INSERT INTO "AuthThrottle" ("key", "count", "windowStart", "updatedAt")
      VALUES (${key}, 1, now(), now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "AuthThrottle"."windowStart" < now() - (${seconds}::int * interval '1 second') THEN 1 ELSE "AuthThrottle"."count" + 1 END,
        "windowStart" = CASE WHEN "AuthThrottle"."windowStart" < now() - (${seconds}::int * interval '1 second') THEN now() ELSE "AuthThrottle"."windowStart" END,
        "updatedAt" = now()
      RETURNING "count", "windowStart", "lockedUntil"`;
    const row = rows[0];
    if (!row) return { allowed: true, retryAfter: 0 };
    const allowed = Number(row.count) <= rule.limit;
    return { allowed, retryAfter: allowed ? 0 : retryAfterSeconds(new Date(row.windowStart).getTime() + rule.windowMs) };
  } catch {
    const result = checkRateLimit(`auth:${key}`, { maxRequests: rule.limit, windowMs: rule.windowMs });
    return { allowed: result.allowed, retryAfter: result.allowed ? 0 : retryAfterSeconds(result.resetAt) };
  }
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
