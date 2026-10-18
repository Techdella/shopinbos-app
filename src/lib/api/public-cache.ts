import "server-only";

import { createHash } from "node:crypto";

import { getRedis } from "@/lib/redis";

// Redis cache for the public marketplace API (the website's reads). Every key carries a generation number;
// invalidatePublicMarketplaceCache bumps it on any supplier, product, logistics or category write, so all cached
// lists and details go stale at once and simply expire. Each instance remembers the generation for a few seconds,
// so a write shows on other instances within VERSION_TTL_MS (the CDN headers already allow minutes).
//
// Without Redis, or when it errors or is slow, the loader runs against the database as before.

const VERSION_KEY = "pc:version";
const VERSION_TTL_MS = 5_000;
const REDIS_TIMEOUT_MS = 400;

export const PUBLIC_LIST_TTL_S = 300;
export const PUBLIC_DETAIL_TTL_S = 600;

let version: { value: number; fetchedAt: number } | null = null;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("redis timeout")), REDIS_TIMEOUT_MS)),
  ]);
}

async function currentVersion(now: number) {
  if (version && now - version.fetchedAt < VERSION_TTL_MS) return version.value;
  const redis = getRedis();
  const value = Number((await withTimeout(redis!.get<number | string>(VERSION_KEY))) ?? 0);
  version = { value, fetchedAt: now };
  return value;
}

/** A cache key: readable scope plus a hash of the query, so search text never lands in a key as-is. */
export function publicCacheKey(scope: string, query: unknown) {
  return `${scope}:${createHash("sha256").update(JSON.stringify(query) ?? "").digest("base64url").slice(0, 32)}`;
}

/**
 * The loader's result from Redis when cached, otherwise loaded and stored for `ttlSeconds`. The value comes back
 * as JSON (dates and decimals as strings), so only pass it straight into the response. null/undefined results
 * (not found) aren't cached.
 */
export async function cachedPublic<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return load();

  let fullKey: string | null = null;
  try {
    fullKey = `pc:${await currentVersion(Date.now())}:${key}`;
    const hit = await withTimeout(redis.get<T>(fullKey));
    if (hit !== null && hit !== undefined) return hit;
  } catch (error) {
    console.warn("[public-cache] read failed; loading from the database", error);
  }

  const value = await load();
  if (fullKey && value !== null && value !== undefined) {
    redis.set(fullKey, value, { ex: ttlSeconds }).catch((error) => console.warn("[public-cache] write failed", error));
  }
  return value;
}

/** Makes every cached public marketplace response stale (they expire on their own). */
export async function bumpPublicCacheVersion() {
  const redis = getRedis();
  if (!redis) return;
  const value = await redis.incr(VERSION_KEY);
  version = { value, fetchedAt: Date.now() };
}
