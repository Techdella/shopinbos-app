// Rules for a store's web address (its slug: <slug>.mybos.store). Pure so the settings forms, the API and tests
// share them. The store name is free to change; the address changes only on purpose, rarely, and the old one
// keeps redirecting (src/lib/store-address.server.ts).

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
/** A live store can change its address at most this often. */
export const SLUG_CHANGE_COOLDOWN_DAYS = 30;
/** Old addresses kept per store (each keeps redirecting). */
export const PREVIOUS_SLUGS_KEPT = 5;

/** "Ada's Fabrics & Co." → "adas-fabrics-co". */
export function normalizeStoreSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/** Why this (already normalized) address can't be used, or null. `reserved` holds platform subdomains. */
export function storeSlugShapeProblem(slug: string, reserved: ReadonlySet<string>): string | null {
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} letters or numbers.`;
  if (reserved.has(slug)) return "That address is reserved. Try another.";
  if (/^\d+$/.test(slug)) return "Add at least one letter.";
  return null;
}

/** Days left before a live store may change its address again (0 = it may change now). */
export function slugCooldownDaysLeft(changedAt: Date | string | null | undefined, now = new Date()) {
  if (!changedAt) return 0;
  const since = now.getTime() - new Date(changedAt).getTime();
  const left = SLUG_CHANGE_COOLDOWN_DAYS * 86_400_000 - since;
  return left > 0 ? Math.ceil(left / 86_400_000) : 0;
}

/** The list of old addresses after moving from `from` to `to` (newest first, `to` never in it). */
export function nextPreviousSlugs(previous: readonly string[], from: string, to: string) {
  return [from, ...previous].filter((slug, i, all) => slug !== to && all.indexOf(slug) === i).slice(0, PREVIOUS_SLUGS_KEPT);
}

/**
 * Where a request for a renamed store should go: same path and query, new slug. `host` is the request's host;
 * on <old>.<root> the first label is swapped, on the app host /s/<old>/… becomes /s/<new>/….
 */
export function renamedStoreTarget(opts: { host: string | null; path: string; oldSlug: string; newSlug: string; storeHost: boolean }) {
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  if (opts.storeHost && opts.host) {
    const host = opts.host.toLowerCase();
    const prefix = `${opts.oldSlug}.`;
    if (!host.startsWith(prefix)) return null;
    // On a store host the shopper's path has no /s/<slug> in it.
    return `https://${opts.newSlug}.${host.slice(prefix.length)}${path}`;
  }
  const base = `/s/${opts.oldSlug}`;
  if (path !== base && !path.startsWith(`${base}/`) && !path.startsWith(`${base}?`)) return `/s/${opts.newSlug}`;
  return `/s/${opts.newSlug}${path.slice(base.length)}`;
}
