import { Redis } from "@upstash/redis";

// The shared Upstash Redis client, or null when it isn't configured (callers then use their Postgres / no-cache
// path). UPSTASH_REDIS_REST_URL/TOKEN, or the KV_REST_API_URL/TOKEN pair Vercel's Upstash integration sets.
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client === undefined) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    client = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  }
  return client;
}
