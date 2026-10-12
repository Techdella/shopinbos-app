import { db } from "@/lib/db/client";
import { customDomainKeyForHost, normalizeHost } from "@/lib/storefront/host-routing";

/**
 * Only a verified domain on an active store is served. customDomainKey is unique, so at most one store
 * matches; a claim that isn't verified yet (Store.pendingDomain) is never looked at here.
 */
function servedDomainWhere(key: string) {
  return { customDomainKey: key, customDomainVerifiedAt: { not: null }, status: "active" } as const;
}

export async function getStoreByCustomDomain(rawDomain: string) {
  const key = customDomainKeyForHost(rawDomain);
  if (!key) return null;
  return db.store.findFirst({ where: servedDomainWhere(key), select: { slug: true } });
}

// Custom-domain → store slug for src/proxy.ts. Every storefront request on a custom domain goes through here,
// so answers (including "no store") are kept in memory for a minute per server instance. Bounded, so random
// Host headers can't grow it without limit.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 2_000;
const domainCache = new Map<string, { slug: string | null; expiresAt: number }>();

/** Drops cached answers for these hosts (and their www/bare twins) on this instance after a domain change. */
export function forgetCustomDomain(...hosts: (string | null | undefined)[]) {
  for (const host of hosts) {
    const key = customDomainKeyForHost(host);
    if (!key) continue;
    domainCache.delete(key);
    domainCache.delete(`www.${key}`);
  }
}

/**
 * The slug of the active store serving this verified custom domain, null when none does, or undefined when
 * the database couldn't be asked (not cached, so the next request tries again).
 */
export async function resolveCustomDomainSlug(host: string, now = Date.now()): Promise<string | null | undefined> {
  const cacheKey = normalizeHost(host);
  const key = customDomainKeyForHost(cacheKey);
  if (!cacheKey || !key) return null;
  const hit = domainCache.get(cacheKey);
  if (hit && hit.expiresAt > now) return hit.slug;

  let slug: string | null;
  try {
    const row = await db.store.findFirst({ where: servedDomainWhere(key), select: { slug: true } });
    slug = row?.slug ?? null;
  } catch (error) {
    console.error("[proxy] custom domain lookup failed", error);
    return undefined;
  }

  domainCache.delete(cacheKey);
  if (domainCache.size >= CACHE_MAX) {
    for (const [cached, entry] of domainCache) {
      if (entry.expiresAt <= now || domainCache.size >= CACHE_MAX) domainCache.delete(cached);
      if (domainCache.size < CACHE_MAX * 0.9) break;
    }
  }
  domainCache.set(cacheKey, { slug, expiresAt: now + CACHE_TTL_MS });
  return slug;
}
