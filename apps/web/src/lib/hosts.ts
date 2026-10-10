import { RESERVED_SUBDOMAINS } from '@shopinbos/config/business';

export type HostKind =
  | { kind: 'app' }
  | { kind: 'store'; slug: string }
  | { kind: 'custom'; hostname: string }
  | { kind: 'reserved'; subdomain: string };

const reserved = new Set<string>(RESERVED_SUBDOMAINS);

/**
 * Decides what a request host serves (SPEC 11.1):
 * - app.shopinbos.com, localhost, *.vercel.app previews → the app
 * - {slug}.shopinbos.com (or {slug}.localhost in dev) → a store
 * - any other host → a seller's custom domain
 */
export function resolveHost(rawHost: string | null, rootDomain: string): HostKind {
  const host = (rawHost ?? '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app'))
    return { kind: 'app' };
  if (host === rootDomain || host === `app.${rootDomain}` || host === `api.${rootDomain}`)
    return { kind: 'app' };

  for (const base of [rootDomain, 'localhost']) {
    if (host.endsWith(`.${base}`)) {
      const sub = host.slice(0, -(base.length + 1));
      if (sub.includes('.')) return { kind: 'custom', hostname: host };
      if (reserved.has(sub))
        return sub === 'app' || sub === 'api'
          ? { kind: 'app' }
          : { kind: 'reserved', subdomain: sub };
      return { kind: 'store', slug: sub };
    }
  }
  return { kind: 'custom', hostname: host };
}

/** Store slugs: 3–40 chars, lowercase letters, digits and single hyphens, not reserved. */
export function isValidStoreSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/.test(slug) && !reserved.has(slug);
}
