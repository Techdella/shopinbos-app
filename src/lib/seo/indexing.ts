// Who may index a store and how: the robots rules every storefront page and robots.txt follow. Pure (no imports)
// so the storefront routes, the robots.txt handlers and tests/storefront-seo.test.mjs share one set of rules.
//
// A store is indexable when it is live (active and published, src/lib/storefront/store-visibility.ts) and the
// seller hasn't turned on Settings → SEO → "Hide my store from search engines" (brandSettings.seo.hideFromSearch).

/** Robots meta, shaped like Next's Metadata["robots"] (kept dependency-free). */
export interface RobotsMeta {
  index: boolean;
  follow: boolean;
  googleBot?: { index: boolean; follow: boolean; "max-image-preview"?: "large"; "max-snippet"?: number; "max-video-preview"?: number };
}

/** Live store pages: index and follow, with large image previews and full snippets (Google, Discover, AI overviews). */
export const INDEX_FOLLOW: RobotsMeta = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
};
/** Stores that aren't live or are hidden: nothing is indexed and nothing is followed. */
export const NOINDEX_NOFOLLOW: RobotsMeta = { index: false, follow: false };
/** Pages of a live store that shouldn't be listed themselves (bag, search results, filtered shop) but link onward. */
export const NOINDEX_FOLLOW: RobotsMeta = { index: false, follow: true };

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Settings → SEO → "Hide my store from search engines" (off by default). */
export function storeHiddenFromSearch(brandSettings: unknown) {
  return rec(rec(brandSettings).seo).hideFromSearch === true;
}

/** Live and not hidden by the seller. */
export function storeIndexable(live: boolean, brandSettings: unknown) {
  return live && !storeHiddenFromSearch(brandSettings);
}

/** Query parameters that only track a visit: a URL carrying only these is still the page itself. */
const TRACKING_PARAM = /^(utm_[a-z_]+|gclid|gbraid|wbraid|fbclid|ttclid|msclkid|twclid|li_fat_id|igshid|mc_cid|mc_eid|ref|sib_c|_ga|_gl)$/i;

/** True when the address has a query that changes what the page lists (search, filters, sort, paging…). */
export function hasVariantQuery(params: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined) {
  if (!params) return false;
  const keys = params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params).filter((key) => params[key] !== undefined);
  return keys.some((key) => !TRACKING_PARAM.test(key));
}

/**
 * The robots meta for one storefront page. `pageNoIndex`: the page's own SEO tab says hide it. `variant`: the
 * address carries a search, filter or sort (its canonical is the plain page, which is the one to index).
 */
export function storePageRobots(input: { indexable: boolean; pageNoIndex?: boolean; variant?: boolean }): RobotsMeta {
  if (!input.indexable) return NOINDEX_NOFOLLOW;
  if (input.pageNoIndex || input.variant) return NOINDEX_FOLLOW;
  return INDEX_FOLLOW;
}

// ─── robots.txt ──────────────────────────────────────────────────────────────

/** Search engines and AI answer engines that are welcome on live stores (named so nothing reads as blocked). */
export const SEARCH_CRAWLERS = ["Googlebot", "Googlebot-Image", "Bingbot", "Applebot", "DuckDuckBot"] as const;
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended",
  "Applebot-Extended",
] as const;

/**
 * Paths on a store host that are never worth crawling: the bag, checkout, orders, payment links, review and
 * sign-up forms, previews and APIs, plus search results and sorted copies of the shop.
 */
export const STORE_DISALLOWED_PATHS = [
  "/cart",
  "/checkout",
  "/order/",
  "/orders",
  "/wishlist",
  "/pay/",
  "/review/",
  "/join/",
  "/preview",
  "/api/",
  "/*?q=",
  "/*&q=",
  "/*?sort=",
  "/*&sort=",
] as const;

function group(agents: readonly string[], lines: string[]) {
  return [...agents.map((agent) => `User-agent: ${agent}`), ...lines].join("\n");
}

/**
 * robots.txt at the root of a store host (<slug>.mybos.store or the seller's own domain). One group names every
 * crawler (a named crawler only reads its own group, so they all get the same rules), then `*`.
 */
export function storeRobotsTxt(input: { indexable: boolean; sitemapUrl?: string | null; llmsUrl?: string | null }) {
  if (!input.indexable) {
    // Not open yet, closed, or hidden by the seller: keep every crawler out.
    return `${group(["*"], ["Disallow: /"])}\n`;
  }
  const rules = ["Allow: /", ...STORE_DISALLOWED_PATHS.map((path) => `Disallow: ${path}`)];
  const parts = [group([...SEARCH_CRAWLERS, ...AI_CRAWLERS, "*"], rules)];
  if (input.sitemapUrl) parts.push(`Sitemap: ${input.sitemapUrl}`);
  // Not a robots.txt directive; a comment so AI agents reading this file find the store summary.
  if (input.llmsUrl) parts.unshift(`# Store summary for AI assistants: ${input.llmsUrl}`);
  return `${parts.join("\n\n")}\n`;
}

/** App areas that are signed-in, private or one-off: never crawled on the app host. */
export const APP_DISALLOWED_PATHS = [
  "/api/",
  "/home",
  "/seller",
  "/onboarding",
  "/products",
  "/builder",
  "/studio",
  "/peggy",
  "/chip",
  "/channels",
  "/marketplace",
  "/preview",
  "/admin",
  "/supplier/",
  "/logistics/",
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/email",
  "/rider",
  "/r/",
  "/_domain",
] as const;

/**
 * robots.txt on the app host (app.shopinbos.com). Stores served at /s/<slug> stay crawlable (their bag, checkout and
 * forms aren't); public partner pages stay open. Store subdomains and custom domains answer their own robots.txt.
 */
export function appRobotsTxt(input: { sitemapUrl?: string | null }) {
  const storeOnly = STORE_DISALLOWED_PATHS.filter((path) => !path.startsWith("/*")).map((path) => `Disallow: /s/*${path}`);
  const rules = [
    "Allow: /",
    "Allow: /s/",
    "Allow: /logistics/partners",
    "Allow: /api/public/feeds/",
    ...APP_DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    ...storeOnly,
    "Disallow: /*?q=",
    "Disallow: /*&q=",
    "Disallow: /*?sort=",
    "Disallow: /*&sort=",
  ];
  const parts = [group(["*"], rules)];
  if (input.sitemapUrl) parts.push(`Sitemap: ${input.sitemapUrl}`);
  return `${parts.join("\n\n")}\n`;
}

/** Cache for robots.txt, sitemaps and llms.txt: fresh for 15 minutes at the edge, served stale for a day while refreshing. */
export const SEO_FILE_CACHE_CONTROL = "public, max-age=900, s-maxage=900, stale-while-revalidate=86400";
