// The shared (Postgres-backed) rate limiter without the database: window math, keys, and what happens when the
// database can't answer. src/lib/rate-limit.ts wires it to Prisma; tests/followups-ratelimit-feeds.test.mjs drives
// it with a fake bucket store. No "@/" imports so node --test can load it directly.
//
// Fixed windows aligned to the epoch (every instance agrees on where a window starts), counted in one row per
// (key, windowStart). The answer uses an approximate sliding window: this window's count plus the previous
// window's count weighted by how much of it still overlaps the last `windowMs`. That stops the "limit at the end
// of one window, limit again at the start of the next" double burst for the price of reading one more row.

import { createHash } from "node:crypto";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface SharedRateLimitConfig extends RateLimitConfig {
  /**
   * Refuse the request when the database can't be asked (sign-in, codes, delivery codes): abuse matters more
   * than a short outage there. Everything else fails open.
   */
  failClosed?: boolean;
  /** Use the sliding estimate (default). false = plain fixed windows. */
  sliding?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** memory: the local fast gate refused; shared: the database answered; fail-open / fail-closed: it errored. */
  source: "memory" | "shared" | "fail-open" | "fail-closed";
}

/** Start of the fixed window `now` falls in (epoch-aligned, so every server instance agrees). */
export function windowStartFor(now: number, windowMs: number) {
  return Math.floor(now / windowMs) * windowMs;
}

/** Rows can go once the next window no longer needs them for the sliding estimate. */
export function bucketExpiresAt(windowStart: number, windowMs: number) {
  return windowStart + 2 * windowMs;
}

/**
 * Approximate sliding-window count: the current window plus the share of the previous window that still lies
 * inside the last `windowMs`.
 */
export function slidingCount(current: number, previous: number, now: number, windowStart: number, windowMs: number) {
  const elapsed = Math.min(1, Math.max(0, (now - windowStart) / windowMs));
  return current + previous * (1 - elapsed);
}

/** The decision for one counted request; `current` already includes it. */
export function decide(current: number, previous: number, now: number, config: SharedRateLimitConfig): Omit<RateLimitResult, "source"> {
  const windowStart = windowStartFor(now, config.windowMs);
  const used = config.sliding === false ? current : slidingCount(current, previous, now, windowStart, config.windowMs);
  const allowed = used <= config.maxRequests;
  return { allowed, remaining: Math.max(0, Math.floor(config.maxRequests - used)), resetAt: windowStart + config.windowMs };
}

/**
 * A limiter key: a readable scope ("public:checkout", "auth:login:ip") and a hash of the identifying parts, so
 * the table never holds raw IPs, emails or phone numbers.
 */
export function rateLimitKey(scope: string, ...parts: Array<string | number | null | undefined>) {
  const id = parts.map((part) => String(part ?? "")).join("\u0000");
  return `${scope}:${createHash("sha256").update(id).digest("base64url").slice(0, 32)}`;
}

/** Postgres "relation does not exist" (42P01): the migration hasn't run yet. */
export function isMissingTable(error: unknown) {
  const seen = new Set<unknown>();
  const walk = (value: unknown, depth: number): boolean => {
    if (!value || typeof value !== "object" || depth > 4 || seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (record.code === "42P01" || record.originalCode === "42P01") return true;
    if (typeof record.message === "string" && /relation "?RateLimitBucket"? does not exist/i.test(record.message)) return true;
    return walk(record.meta, depth + 1) || walk(record.cause, depth + 1) || walk(record.driverAdapterError, depth + 1);
  };
  return walk(error, 0);
}

export interface SharedLimiterDeps {
  /** The in-memory fast gate (same key and config). */
  memory(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number };
  /** Atomically counts one request in (key, windowStart); returns this window's count and the previous one's. */
  bump(input: { key: string; windowStart: Date; previousStart: Date; expiresAt: Date }): Promise<{ current: number; previous: number }>;
  /** Deletes some expired rows; called on a small share of requests. */
  sweep?(now: Date): Promise<unknown>;
  now?(): number;
  random?(): number;
  warn?(message: string, error?: unknown): void;
}

export const SWEEP_CHANCE = 0.01;

/**
 * The memory gate first (a flood from one client never reaches the database), then the shared count. On a
 * database error: fail open with a warning, or, for failClosed limits, refuse. A missing table (migration not
 * run yet) is a deploy problem rather than an attack, so it falls back to the memory answer instead of locking
 * everyone out of sign-in.
 */
export async function checkShared(deps: SharedLimiterDeps, key: string, config: SharedRateLimitConfig): Promise<RateLimitResult> {
  const local = deps.memory(key, config);
  if (!local.allowed) return { ...local, source: "memory" };

  const now = deps.now?.() ?? Date.now();
  const windowStart = windowStartFor(now, config.windowMs);
  const warn = deps.warn ?? ((message: string, error?: unknown) => console.warn(message, error));
  try {
    const counts = await deps.bump({
      key,
      windowStart: new Date(windowStart),
      previousStart: new Date(windowStart - config.windowMs),
      expiresAt: new Date(bucketExpiresAt(windowStart, config.windowMs)),
    });
    if (deps.sweep && (deps.random?.() ?? Math.random()) < SWEEP_CHANCE) {
      deps.sweep(new Date(now)).catch((error) => warn("[rate-limit] cleanup failed", error));
    }
    return { ...decide(counts.current, counts.previous, now, config), source: "shared" };
  } catch (error) {
    const scope = key.split(":").slice(0, 2).join(":");
    if (config.failClosed && !isMissingTable(error)) {
      warn(`[rate-limit] shared check failed for ${scope}; refusing (fail closed)`, error);
      // An outage, not the caller's fault: ask them to try again shortly rather than at the end of the window.
      return { allowed: false, remaining: 0, resetAt: now + Math.min(config.windowMs, 60_000), source: "fail-closed" };
    }
    warn(`[rate-limit] shared check failed for ${scope}; using this instance's count (fail open)`, error);
    return { ...local, source: "fail-open" };
  }
}
