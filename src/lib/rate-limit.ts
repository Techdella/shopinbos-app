import { db } from "@/lib/db/client";
import { Redis } from "@upstash/redis";
import { checkShared, rateLimitKey, type RateLimitConfig, type RateLimitResult, type SharedRateLimitConfig } from "@/lib/rate-limit-core";

// Two limiters:
// - checkRateLimit: in-memory, per server instance. Cheap; fine for analytics pings, chat polling and other
//   low-risk endpoints, and the fast first gate of the shared one.
// - checkRateLimitShared: the same memory gate, then a count every instance shares (Upstash Redis when configured,
//   else Postgres "RateLimitBucket"), so a limit is global on Vercel. Used where abuse costs something: sign-in and codes, checkout, order
//   lookup, forms, support tickets, AI, CAC checks, domain verification, delivery codes.

export type { RateLimitConfig, RateLimitResult, SharedRateLimitConfig };
export { rateLimitKey };

const store = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

const DEFAULTS: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 };

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULTS,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    for (const [k, v] of store) {
      if (now > v.resetAt) store.delete(k);
    }
  }

  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

type BumpRow = { current: number; previous: number | null };

// Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are set (or Vercel's KV_REST_API_URL/TOKEN); otherwise the
// Postgres table. Same windows and keys either way, so switching backends only resets the current window.
let redis: Redis | null | undefined;
function sharedRedis() {
  if (redis === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  }
  return redis;
}

const REDIS_PREFIX = "rl:";

/**
 * Counts one request for `key` in the shared store (after the in-memory gate) and says whether it's allowed.
 * Fails open with a console.warn when the store errors, unless `failClosed` is set.
 */
export function checkRateLimitShared(key: string, config: SharedRateLimitConfig): Promise<RateLimitResult> {
  const kv = sharedRedis();
  if (kv) {
    return checkShared(
      {
        memory: checkRateLimit,
        // One round trip: count this window (the key expires itself once the sliding estimate is done with it)
        // and read the previous window's count.
        async bump({ key: bucketKey, windowStart, previousStart, expiresAt }) {
          const current = `${REDIS_PREFIX}${bucketKey}:${windowStart.getTime()}`;
          const [count, , previous] = await kv
            .pipeline()
            .incr(current)
            .pexpireat(current, expiresAt.getTime())
            .get<number | string>(`${REDIS_PREFIX}${bucketKey}:${previousStart.getTime()}`)
            .exec<[number, number, number | string | null]>();
          return { current: Number(count), previous: Number(previous ?? 0) };
        },
      },
      key,
      config,
    );
  }
  return checkShared(
    {
      memory: checkRateLimit,
      async bump({ key: bucketKey, windowStart, previousStart, expiresAt }) {
        const rows = await db.$queryRaw<BumpRow[]>`
          INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
          VALUES (${bucketKey}, ${windowStart}, 1, ${expiresAt})
          ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
          RETURNING "count" AS "current",
            (SELECT p."count" FROM "RateLimitBucket" p WHERE p."key" = ${bucketKey} AND p."windowStart" = ${previousStart}) AS "previous"`;
        const row = rows[0];
        if (!row) throw new Error("RateLimitBucket upsert returned no row");
        return { current: Number(row.current), previous: Number(row.previous ?? 0) };
      },
      sweep: (now) => db.$executeRaw`
        DELETE FROM "RateLimitBucket" WHERE ctid IN (
          SELECT ctid FROM "RateLimitBucket" WHERE "expiresAt" < ${now} LIMIT 500
        )`,
    },
    key,
    config,
  );
}

/** The caller's IP as the platform reports it (Vercel sets x-forwarded-for itself), for rate-limit keys. */
export function requestIp(headers: { get(name: string): string | null }) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/**
 * Per-IP limits for the public storefront APIs (no sign-in). The ones in SHARED_PUBLIC_LIMITS are global (counted
 * in the shared store); the rest are per server instance: they slow a single client down, not a global quota.
 */
export const PUBLIC_LIMITS = {
  // Generous enough for shoppers sharing a mobile carrier's IP (CGNAT), tight enough to stop order spam
  // (pending orders hold stock) and guessing a buyer's contact for an order number.
  checkout: { maxRequests: 30, windowMs: 10 * 60_000 },
  orderLookup: { maxRequests: 20, windowMs: 10 * 60_000 },
  form: { maxRequests: 10, windowMs: 60_000 },
  quote: { maxRequests: 60, windowMs: 60_000 },
  cart: { maxRequests: 60, windowMs: 60_000 },
  abandonedCart: { maxRequests: 60, windowMs: 60_000 },
  wishlist: { maxRequests: 60, windowMs: 60_000 },
  visit: { maxRequests: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

export type PublicAction = keyof typeof PUBLIC_LIMITS;

/**
 * Public actions counted globally, and how they behave if the database errors. Order lookup fails closed (it
 * guards guessing a buyer's contact, and it can't answer without the database anyway); the rest fail open so a
 * database hiccup never stops a shopper paying. Quote, cart and visit stay in memory: frequent, cheap, low risk.
 */
export const SHARED_PUBLIC_LIMITS: Partial<Record<PublicAction, { failClosed?: boolean }>> = {
  checkout: {},
  orderLookup: { failClosed: true },
  form: {},
  abandonedCart: {},
  wishlist: {},
};

/** The key a public action counts under for this IP (hashed: the table never holds raw IPs). */
export function publicLimitKey(action: PublicAction, ip: string) {
  return rateLimitKey(`public:${action}`, ip);
}

/** True when this IP has used up its allowance for that public action. */
export async function overPublicLimit(headers: { get(name: string): string | null }, action: PublicAction) {
  const key = publicLimitKey(action, requestIp(headers));
  const shared = SHARED_PUBLIC_LIMITS[action];
  if (!shared) return !checkRateLimit(key, PUBLIC_LIMITS[action]).allowed;
  return !(await checkRateLimitShared(key, { ...PUBLIC_LIMITS[action], ...shared })).allowed;
}
