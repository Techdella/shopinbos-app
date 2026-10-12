// Which site a request's Host belongs to: the app itself, a store's platform subdomain (<slug>.shopinbos.com),
// a seller's own custom domain, or nothing we serve. Pure (no imports) so src/proxy.ts and
// tests/host-routing.test.mjs share it.

/** The domain every deployment of Shopinbos owns, whatever NEXT_PUBLIC_ROOT_DOMAIN says. */
export const PLATFORM_DOMAIN = "shopinbos.com";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/**
 * Subdomains of the platform root that are never stores: they are (or may become) the app, the API, the
 * portals or infrastructure. Requests to them are handled as app hosts, as every *.shopinbos.com host was before.
 */
export const RESERVED_SUBDOMAINS = new Set([
  "app", "www", "api", "admin", "supplier", "suppliers", "logistics", "seller", "sellers", "portal", "dashboard",
  "auth", "login", "signup", "account", "accounts", "mail", "email", "smtp", "imap", "pop", "mx", "webmail",
  "inbox", "support", "help", "docs", "status", "blog", "news", "cdn", "static", "assets", "media", "img",
  "images", "files", "uploads", "storage", "ftp", "dev", "staging", "stage", "preview", "test", "demo", "beta",
  "internal", "ns1", "ns2", "shop", "store", "stores", "marketplace", "rider", "riders", "chip", "peggy",
]);

export type HostRoute =
  | { kind: "app" }
  | { kind: "store"; slug: string }
  | { kind: "custom"; domain: string }
  | { kind: "unknown" };

export interface HostRoutingConfig {
  /** NEXT_PUBLIC_ROOT_DOMAIN (or the app URL's host): store subdomains live under it. */
  rootDomain: string;
  /** Hosts the app itself is served on (NEXT_PUBLIC_APP_URL, APP_URL, CSRF_TRUSTED_ORIGINS). */
  appHosts?: readonly (string | null | undefined)[];
}

/** "Shop.Example.com.:443" → "shop.example.com"; "[::1]:3000" → "::1". Empty when there's nothing usable. */
export function normalizeHost(raw: string | null | undefined) {
  let host = String(raw ?? "").trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split("/")[0] ?? "";
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? "" : host.slice(1, end);
  }
  return host.replace(/:\d*$/, "").replace(/\.+$/, "");
}

/** Hostnames from URLs or bare hosts ("https://app.shopinbos.com", "app.shopinbos.com:443"). */
export function hostsFromList(values: readonly (string | null | undefined)[]) {
  const out: string[] = [];
  for (const value of values) {
    for (const part of String(value ?? "").split(",")) {
      const host = normalizeHost(part);
      if (host) out.push(host);
    }
  }
  return out;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIpLiteral(host: string) {
  return IPV4.test(host) || host.includes(":");
}

function isDomainName(host: string) {
  if (host.length > 253 || !host.includes(".") || isIpLiteral(host)) return false;
  const labels = host.split(".");
  return labels.every((label) => LABEL.test(label)) && /[a-z]/.test(labels[labels.length - 1]!);
}

/** The store-slug part of "<label>.<root>", or null when the host isn't a single-label subdomain of root. */
function subdomainOf(host: string, root: string) {
  if (!root || !host.endsWith(`.${root}`)) return null;
  return host.slice(0, -(root.length + 1));
}

export function classifyHost(rawHost: string | null | undefined, config: HostRoutingConfig): HostRoute {
  const host = normalizeHost(rawHost);
  // No Host header at all: keep the app's behaviour rather than guessing.
  if (!host) return { kind: "app" };
  if (LOCAL_HOSTS.has(host) || host.endsWith(".vercel.app")) return { kind: "app" };

  const rootDomain = normalizeHost(config.rootDomain).replace(/^www\./, "");
  const appHosts = new Set(hostsFromList(config.appHosts ?? []));
  if (appHosts.has(host)) return { kind: "app" };

  const roots = Array.from(new Set([rootDomain, PLATFORM_DOMAIN, "localhost"].filter(Boolean)));
  for (const root of roots) {
    if (host === root || host === `www.${root}`) return { kind: "app" };
    const sub = subdomainOf(host, root);
    if (sub === null) continue;
    // Deeper names (a.b.shopinbos.com), reserved names and anything that can't be a slug stay with the app,
    // as every *.shopinbos.com host did before store subdomains were routed.
    if (sub.includes(".") || RESERVED_SUBDOMAINS.has(sub) || !LABEL.test(sub)) {
      return { kind: "app" };
    }
    return { kind: "store", slug: sub };
  }

  if (isDomainName(host)) return { kind: "custom", domain: host };
  return { kind: "unknown" };
}

// ─── Paths on a store host ───────────────────────────────────────────────────

const STATIC_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "css", "js", "mjs", "map", "txt", "xml",
  "json", "webmanifest", "woff", "woff2", "ttf", "otf", "eot", "mp4", "webm", "mp3", "wav", "pdf",
]);

/** APIs a storefront calls from the shopper's browser (everything else under /api is the app's). */
export const STOREFRONT_API_PREFIXES = ["/api/public", "/api/store/coupons/validate"];

/** App areas that must never be served on a store's host, even as static-looking paths. */
const APP_ONLY_PREFIXES = [
  "/home", "/seller", "/onboarding", "/products", "/builder", "/studio", "/peggy", "/chip", "/channels",
  "/marketplace", "/preview", "/supplier", "/suppliers", "/logistics", "/admin", "/login", "/signup", "/auth",
  "/forgot-password", "/reset-password", "/email", "/rider", "/store", "/s", "/r", "/_domain",
];

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export type StorePathAction = { action: "pass" } | { action: "rewrite"; pathname: string } | { action: "not-found" };

/**
 * What a store host (subdomain or custom domain) does with a path: framework files, storefront APIs and
 * static files pass through; other APIs are 404; every page, including portal paths like /home or /admin,
 * is rewritten into that store's storefront (/s/<slug>/home is the storefront's own 404, never the portal).
 */
export function storePathAction(pathname: string, slug: string): StorePathAction {
  const path = pathname || "/";
  if (path.startsWith("/_next/")) return { action: "pass" };
  if (path === "/favicon.ico" || path.startsWith("/favicon") || path === "/robots.txt" || path === "/sitemap.xml") return { action: "pass" };
  if (path === "/api" || path.startsWith("/api/")) {
    return STOREFRONT_API_PREFIXES.some((prefix) => under(path, prefix)) ? { action: "pass" } : { action: "not-found" };
  }
  const last = path.slice(path.lastIndexOf("/") + 1);
  const ext = last.includes(".") ? last.slice(last.lastIndexOf(".") + 1).toLowerCase() : "";
  if (ext && STATIC_EXTENSIONS.has(ext) && !APP_ONLY_PREFIXES.some((prefix) => under(path, prefix))) return { action: "pass" };
  return { action: "rewrite", pathname: `/s/${slug}${path === "/" ? "" : path}` };
}

// ─── Custom domains ──────────────────────────────────────────────────────────

/** The stored customDomain values a host may match: itself, its apex and its www form. */
export function customDomainCandidates(host: string) {
  const normalized = normalizeHost(host);
  if (!normalized) return [];
  const apex = normalized.replace(/^www\./, "");
  return Array.from(new Set([normalized, apex, `www.${apex}`]));
}

/**
 * Picks the store for a custom-domain host from the active stores whose customDomain is one of the candidates.
 * An exact match beats the www/apex twin; if two stores claim the same domain, neither is served.
 */
export function pickCustomDomainStore(host: string, rows: readonly { slug: string; customDomain: string | null }[]) {
  const wanted = normalizeHost(host);
  const normalized = rows
    .map((row) => ({ slug: row.slug, domain: normalizeHost(row.customDomain) }))
    .filter((row) => row.domain && customDomainCandidates(wanted).includes(row.domain));
  const exact = normalized.filter((row) => row.domain === wanted);
  const pool = exact.length ? exact : normalized;
  const slugs = new Set(pool.map((row) => row.slug));
  return slugs.size === 1 ? pool[0]!.slug : null;
}
