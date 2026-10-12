const store = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

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

/** The caller's IP as the platform reports it (Vercel sets x-forwarded-for itself), for rate-limit keys. */
export function requestIp(headers: { get(name: string): string | null }) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

/**
 * Per-IP limits for the public storefront APIs (no sign-in). In-memory, so per server instance: it slows a
 * single client down; it is not a global quota.
 */
export const PUBLIC_LIMITS = {
  // Generous enough for shoppers sharing a mobile carrier's IP (CGNAT), tight enough to stop order spam
  // (pending orders hold stock) and guessing a buyer's contact for an order number.
  checkout: { maxRequests: 30, windowMs: 10 * 60_000 },
  orderLookup: { maxRequests: 20, windowMs: 10 * 60_000 },
  form: { maxRequests: 10, windowMs: 60_000 },
  quote: { maxRequests: 60, windowMs: 60_000 },
  cart: { maxRequests: 60, windowMs: 60_000 },
  wishlist: { maxRequests: 60, windowMs: 60_000 },
  visit: { maxRequests: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

/** True when this IP has used up its allowance for that public action. */
export function overPublicLimit(headers: { get(name: string): string | null }, action: keyof typeof PUBLIC_LIMITS) {
  return !checkRateLimit(`public:${action}:${requestIp(headers)}`, PUBLIC_LIMITS[action]).allowed;
}
