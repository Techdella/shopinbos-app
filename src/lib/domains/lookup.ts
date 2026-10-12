import { db } from "@/lib/db/client";
import { customDomainCandidates, normalizeHost, pickCustomDomainStore } from "@/lib/storefront/host-routing";
import { getDomainLookupCandidates } from "./storefront";

export async function getStoreByCustomDomain(rawDomain: string) {
  const candidates = getDomainLookupCandidates(rawDomain);

  return db.store.findFirst({
    where: {
      customDomain: { in: candidates },
      status: "active",
    },
    select: { slug: true },
  });
}

// Custom-domain → store slug for src/proxy.ts. Every storefront request on a custom domain goes through here,
// so answers (including "no store") are kept in memory for a minute per server instance. Bounded, so random
// Host headers can't grow it without limit.
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 2_000;
const domainCache = new Map<string, { slug: string | null; expiresAt: number }>();

/**
 * The slug of the active store serving this custom domain, null when none does (or two stores claim it), or
 * undefined when the database couldn't be asked (not cached, so the next request tries again).
 */
export async function resolveCustomDomainSlug(host: string, now = Date.now()): Promise<string | null | undefined> {
  const key = normalizeHost(host);
  if (!key) return null;
  const hit = domainCache.get(key);
  if (hit && hit.expiresAt > now) return hit.slug;

  let slug: string | null;
  try {
    const rows = await db.store.findMany({
      where: { customDomain: { in: customDomainCandidates(key) }, status: "active" },
      select: { slug: true, customDomain: true },
      take: 5,
    });
    slug = pickCustomDomainStore(key, rows);
  } catch (error) {
    console.error("[proxy] custom domain lookup failed", error);
    return undefined;
  }

  domainCache.delete(key);
  if (domainCache.size >= CACHE_MAX) {
    for (const [cached, entry] of domainCache) {
      if (entry.expiresAt <= now || domainCache.size >= CACHE_MAX) domainCache.delete(cached);
      if (domainCache.size < CACHE_MAX * 0.9) break;
    }
  }
  domainCache.set(key, { slug, expiresAt: now + CACHE_TTL_MS });
  return slug;
}
