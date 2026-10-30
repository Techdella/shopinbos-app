// Where each page of a live store lives: /shop, /about, /contact, /faq, /<custom page slug>… under the store's base
// ("" on <slug>.mybos.store and custom domains, "/s/<slug>" on the app host). Pure so the storefront client, the
// server routes, the legacy ?page= redirect and the tests share one map.
//
// A page "key" is what the storefront renderers select a page by: its pageType for the standard pages (home,
// products, about…) or its slug for a seller's custom page.

/** The address of each standard page. "products" is served at /shop: /products also works and redirects there. */
export const STOREFRONT_PAGE_PATHS: Readonly<Record<string, string>> = {
  home: "/",
  products: "/shop",
  categories: "/categories",
  about: "/about",
  contact: "/contact",
  faq: "/faq",
  // These three are real routes of their own (src/app/s/[slug]/wishlist, blog, checkout): picking them in the
  // storefront shows that address, and opening it serves the dedicated page.
  wishlist: "/wishlist",
  blog: "/blog",
  checkout: "/checkout",
};

/** Other names a page is reached by (old template page types, the /products alias). */
const KEY_ALIASES: Readonly<Record<string, string>> = { shop: "products", menu: "products", home: "home" };

/**
 * First path segments that are the store's own routes (cart, product pages, the link in bio page, CMS collections'
 * neighbours…), so a custom page with that slug can't take them over. Matches the folders (and file routes) under
 * src/app/s/[slug] and src/app/_domain/[domain]; tests/behaviour.test.mjs fails when a new folder isn't listed.
 * "links" is the link in bio page (/links): it always wins over a page with that slug.
 */
export const STOREFRONT_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  "ajo", "api", "blog", "buy", "cart", "checkout", "group", "plan", "collections", "join", "links", "order", "orders", "pay", "policies", "preview", "product",
  "review", "reviews", "wishlist", "s", "_next",
  "llms.txt", "llms-full.txt", "robots.txt", "sitemap.xml",
]);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_KEY = 80;

/**
 * The page types stores are built from (templates, Rex, Pages › New). Their rows keep the slug of their type even
 * when it is a route name (product, cart, blog…), since the storefront finds them by type, not by address.
 */
export const TEMPLATE_PAGE_TYPES: ReadonlySet<string> = new Set([
  "home", "products", "product", "categories", "cart", "checkout", "wishlist", "blog", "about", "contact", "faq", "collection", "custom",
]);

/**
 * True when a seller's own page can't have this address: a store route (/links, /cart, /pay…) or another name for
 * a standard page (/shop, /menu, /home). Such a page would never be shown.
 */
export function isReservedPageSlug(slug: string) {
  const key = slug.trim().toLowerCase();
  return STOREFRONT_ROUTE_SEGMENTS.has(key) || key in KEY_ALIASES;
}

/**
 * A free address for a new or renamed custom page: "links" becomes "links-page" (a store route), and a taken one
 * gets -2, -3… ("lookbook-2"). `taken` is the store's other page slugs (and page types).
 */
export function customPageSlug(base: string, taken: Iterable<string> = []) {
  const used = new Set(taken);
  const root = base.trim().toLowerCase() || "page";
  const start = isReservedPageSlug(root) ? `${root}-page` : root;
  let slug = start;
  for (let n = 2; used.has(slug) || isReservedPageSlug(slug); n += 1) slug = `${start}-${n}`;
  return slug;
}

/** "My Page " → "my-page": what a typed page address is saved as. */
export function normalizePageSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Why a page can't move to this address (null when it can): not a clean slug, or a store route (/links, /cart…).
 * A template page keeps its own type's slug (the product page stays "product").
 */
export function pageSlugProblem(slug: string, pageType?: string | null): string | null {
  if (!slug || slug.length > MAX_KEY || !SLUG.test(slug)) return "Use lowercase letters, numbers and single dashes for the page address.";
  if (pageType && slug === pageType && TEMPLATE_PAGE_TYPES.has(slug)) return null;
  if (isReservedPageSlug(slug)) {
    const what = slug === "links" ? " for your link in bio page" : "";
    return `/${slug} is already used by your store${what}. Pick another address, like ${customPageSlug(slug)}.`;
  }
  return null;
}

/** "Shop" → "products", "" → "home", "about" → "about"; null when it can't be a page key. */
export function normalizeStorefrontPageKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (!key) return "home";
  if (key.length > MAX_KEY || !SLUG.test(key)) return null;
  return KEY_ALIASES[key] ?? key;
}

/** The path of a page relative to the store's base ("/about"), or null when it has no address of its own (product, cart). */
export function storefrontPagePath(rawKey: unknown): string | null {
  const key = normalizeStorefrontPageKey(rawKey);
  if (!key) return null;
  const fixed = STOREFRONT_PAGE_PATHS[key];
  if (fixed) return fixed;
  if (key === "product" || key === "cart" || STOREFRONT_ROUTE_SEGMENTS.has(key)) return null;
  return `/${key}`;
}

/** "/about" → "about", "/" → "home", "/shop" and "/products" → "products"; null for deeper paths and other routes. */
export function storefrontPageKeyFromPath(path: string): string | null {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "home";
  if (trimmed.includes("/")) return null;
  let segment = trimmed;
  try {
    segment = decodeURIComponent(trimmed);
  } catch {
    return null;
  }
  const key = normalizeStorefrontPageKey(segment);
  // /cart, /product, /preview… are routes of their own, not pages.
  return key && storefrontPagePath(key) ? key : null;
}

/** The page a browser location shows, given the store's base ("/s/adas/about" with base "/s/adas" → "about"). */
export function storefrontPageKeyFromLocation(pathname: string, basePath: string): string | null {
  const base = basePath.replace(/\/+$/, "");
  if (base) {
    if (pathname !== base && !pathname.startsWith(`${base}/`)) return null;
    return storefrontPageKeyFromPath(pathname.slice(base.length));
  }
  return storefrontPageKeyFromPath(pathname);
}

/** True when the path a shopper opened is a page's alias rather than its address (/products → /shop, /home → /). */
export function isStorefrontPageAlias(segment: string, key: string) {
  const path = storefrontPagePath(key);
  return path !== null && path !== `/${segment}`;
}

function joinBase(basePath: string, path: string) {
  const base = basePath.replace(/\/+$/, "");
  if (!base) return path;
  return path === "/" ? base : `${base}${path}`;
}

function queryString(params: URLSearchParams) {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** A page's full href under the store's base, with an optional query ("" base, "products" → "/shop"). */
export function storefrontPageHref(basePath: string, key: unknown, params?: URLSearchParams): string | null {
  const path = storefrontPagePath(key);
  if (!path) return null;
  return `${joinBase(basePath, path)}${params ? queryString(params) : ""}`;
}

/** Reads a Next.js searchParams record as URLSearchParams (repeated keys kept). */
export function searchParamsFromRecord(record: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) for (const entry of value) params.append(key, entry);
    else if (typeof value === "string") params.append(key, value);
  }
  return params;
}

/**
 * Old links (/?page=about&category=bags) → the page's own address with the rest of the query kept
 * (/about?category=bags). A ?page= that names nothing with an address goes home. null when there's no ?page=.
 */
export function legacyPageRedirectTarget(basePath: string, params: URLSearchParams): string | null {
  if (!params.has("page")) return null;
  const rest = new URLSearchParams(params);
  const requested = rest.get("page");
  rest.delete("page");
  return storefrontPageHref(basePath, requested, rest) ?? `${joinBase(basePath, "/")}${queryString(rest)}`;
}

type SnapshotPageLike = { pageType?: unknown; slug?: unknown };

/** The page of a snapshot a key selects: by page type first (about, products…), then by slug (custom pages). */
export function findStorefrontPage<T extends SnapshotPageLike>(pages: readonly T[], rawKey: unknown): T | undefined {
  const key = normalizeStorefrontPageKey(rawKey);
  if (!key) return undefined;
  return (
    pages.find((page) => page.pageType === key) ??
    (key === "home" ? pages.find((page) => page.slug === "" || page.slug === "home") : undefined) ??
    pages.find((page) => typeof page.slug === "string" && page.slug !== "" && normalizeStorefrontPageKey(page.slug) === key)
  );
}

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * Whether a live store has the page a key names: in its published builder snapshot or its published page rows
 * (the storefront renders one or the other). Home and the shop always exist.
 */
export function storeHasStorefrontPage(store: { pages?: unknown; brandSettings?: unknown }, rawKey: unknown) {
  const key = normalizeStorefrontPageKey(rawKey);
  if (!key || !storefrontPagePath(key)) return false;
  if (key === "home" || key === "products") return true;
  const snapshotPages = rec(rec(rec(store.brandSettings).editor).published).pages;
  if (Array.isArray(snapshotPages) && findStorefrontPage(snapshotPages.map(rec), key)) return true;
  const rows = Array.isArray(store.pages) ? store.pages.map(rec) : [];
  return Boolean(findStorefrontPage(rows.map((row) => ({ pageType: rec(row.publishedContent ?? row.content).pageType ?? row.type, slug: row.slug })), key));
}
