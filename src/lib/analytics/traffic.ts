// Store traffic: which pages of a store people open, where they came from, on what device, what they searched for
// and how far they got (/home/analytics/traffic and Peggy's store_traffic_report). Pure: the storefront beacon's
// inputs are cleaned here and the report is computed here, so tests/store-traffic.test.mjs runs it directly.
//
// Privacy: only counts per day are kept (StoreTrafficDaily). No IP address, no user agent, no visitor id, no full
// referrer URL: a referrer is cut to its host, a user agent to "mobile" / "tablet" / "desktop", a location to the
// country and city the hosting platform already derived, and search terms that look like an email, phone number
// or link are dropped. Unique visitors come from daily HyperLogLog sketches (StoreVisitorSketch, ./hll.ts), which
// hold register bytes only and merge across days, so someone who visits on several days counts once.

import { normalizeCampaign, normalizeSource } from "./sources.ts";
import { rangeBuckets, type ResolvedRange } from "./range.ts";
import { estimate, mergeSketches, type HllSketch } from "./hll.ts";

export const TRAFFIC_METRICS = [
  "session", // one per browser session (its first page): dims "", source, referrer, device, country, city, medium, campaign
  "entry", // the session's first page: dim path
  "page_view", // every page opened: dims "", path
  "new_visitor", // a browser's first visit ever (on this device); unique visitors are StoreVisitorSketch, not a counter
  "engaged_seconds", // seconds a page was visible: dims "", path
  "engaged_view", // pages that reported engaged time: dims "", path
  "search", // a search on the store's shop page: dim term
] as const;
export type TrafficMetric = (typeof TRAFFIC_METRICS)[number];

export interface TrafficRow {
  day: string;
  metric: string;
  dim: string;
  value: string;
  count: number;
}

/** One counter to add: what the beacon route writes (several per request, one SQL statement). */
export interface TrafficIncrement {
  metric: TrafficMetric;
  dim: string;
  value: string;
  amount: number;
}

// ─── Cleaning beacon input ────────────────────────────────────────────────────

export type PageKind =
  | "home" | "shop" | "categories" | "page" | "product" | "collection" | "blog" | "blog_post" | "cart" | "checkout"
  | "order" | "wishlist" | "policy" | "reviews" | "links" | "pay" | "form" | "content";

export interface StorePath {
  /** The path relative to the store's root, as stored and shown ("/", "/shop", "/product/abc"). */
  path: string;
  kind: PageKind;
  productId?: string;
}

const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Paths whose last part is private (an order, a payment code, a review token): only the first part is kept. */
const PRIVATE_TAIL = new Set(["order", "orders", "pay", "review", "join"]);
const KIND_BY_FIRST: Record<string, PageKind> = {
  shop: "shop", products: "shop", categories: "categories", cart: "cart", checkout: "checkout", wishlist: "wishlist",
  policies: "policy", reviews: "reviews", links: "links", order: "order", orders: "order", pay: "pay", review: "reviews", join: "form",
};

/**
 * A shopper's location path → the page it is on this store, or null when it isn't a store page we count (the owner
 * preview, API calls, junk). `/s/<slug>` is removed first, so the free address and a custom domain count the same.
 */
export function normalizeStorePath(raw: unknown, slug: string): StorePath | null {
  if (typeof raw !== "string") return null;
  let path = raw.split(/[?#]/)[0].trim();
  if (!path.startsWith("/") || path.length > 300) return null;
  const prefix = `/s/${slug.toLowerCase()}`;
  if (path.toLowerCase() === prefix || path.toLowerCase().startsWith(`${prefix}/`)) path = path.slice(prefix.length);
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return { path: "/", kind: "home" };
  const first = parts[0].toLowerCase();
  if (first === "preview" || first === "api" || first === "_next" || first === "s") return null;

  if (first === "product") {
    if (parts.length !== 2 || !PRODUCT_ID.test(parts[1])) return null;
    return { path: `/product/${parts[1]}`, kind: "product", productId: parts[1] };
  }
  if (PRIVATE_TAIL.has(first)) return parts.length <= 2 ? { path: `/${first === "orders" ? "order" : first}`, kind: KIND_BY_FIRST[first] } : null;

  const lower = parts.map((part) => part.toLowerCase());
  if (lower.length > 2 || !lower.every((part) => SEGMENT.test(part))) return null;
  if (first === "blog") return lower.length === 1 ? { path: "/blog", kind: "blog" } : { path: `/blog/${lower[1]}`, kind: "blog_post" };
  if (first === "collections") return lower.length === 2 ? { path: `/collections/${lower[1]}`, kind: "collection" } : null;
  if (first === "policies") return { path: `/${lower.join("/")}`, kind: "policy" };
  const fixed = KIND_BY_FIRST[first];
  if (fixed) return lower.length === 1 ? { path: first === "products" ? "/shop" : `/${first}`, kind: fixed } : null;
  // A custom page (/about, /lookbook) or a content collection and its item (/recipes/jollof).
  return { path: `/${lower.join("/")}`, kind: lower.length === 1 ? "page" : "content" };
}

/** "https://www.Google.com/search?q=x" or "l.instagram.com" → "google.com" / "l.instagram.com"; "" when not a host. */
export function normalizeReferrerHost(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  let host = raw.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return "";
    }
  }
  host = host.split(/[/?#:]/)[0].replace(/^www\./, "").replace(/\.$/, "");
  if (host.length > 100 || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)) return "";
  return host;
}

export type SourceKind = "search" | "ai" | "social" | "messaging" | "email" | "ads" | "referral" | "direct" | "tagged";

interface KnownSource {
  key: string;
  kind: SourceKind;
}

// Checked in order: AI assistants that live on a search engine's domain (gemini.google.com) come before it.
const REFERRER_RULES: Array<[RegExp, KnownSource]> = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, { key: "chatgpt", kind: "ai" }],
  [/(^|\.)perplexity\.ai$/, { key: "perplexity", kind: "ai" }],
  [/(^|\.)(gemini\.google\.com|bard\.google\.com)$/, { key: "gemini", kind: "ai" }],
  [/(^|\.)copilot\.microsoft\.com$/, { key: "copilot", kind: "ai" }],
  [/(^|\.)claude\.ai$/, { key: "claude", kind: "ai" }],
  [/(^|\.)(you\.com|phind\.com|meta\.ai|deepseek\.com|chat\.deepseek\.com|grok\.com|poe\.com)$/, { key: "ai_other", kind: "ai" }],
  [/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com)$/, { key: "email", kind: "email" }],
  [/(^|\.)(googleadservices\.com|doubleclick\.net|googlesyndication\.com)$/, { key: "google_ads", kind: "ads" }],
  [/(^|\.)google\.[a-z.]+$/, { key: "google", kind: "search" }],
  [/(^|\.)bing\.com$/, { key: "bing", kind: "search" }],
  [/(^|\.)(duckduckgo\.com|search\.yahoo\.com|yahoo\.com|yandex\.[a-z.]+|ecosia\.org|search\.brave\.com|baidu\.com)$/, { key: "search_other", kind: "search" }],
  [/(^|\.)instagram\.com$/, { key: "instagram", kind: "social" }],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, { key: "facebook", kind: "social" }],
  [/(^|\.)(wa\.me|whatsapp\.com|whatsapp\.net)$/, { key: "whatsapp", kind: "messaging" }],
  [/(^|\.)(tiktok\.com)$/, { key: "tiktok", kind: "social" }],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, { key: "x", kind: "social" }],
  [/(^|\.)(youtube\.com|youtu\.be)$/, { key: "youtube", kind: "social" }],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, { key: "pinterest", kind: "social" }],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, { key: "linkedin", kind: "social" }],
  [/(^|\.)snapchat\.com$/, { key: "snapchat", kind: "social" }],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, { key: "telegram", kind: "messaging" }],
];

const KIND_OF_KEY: Record<string, SourceKind> = Object.fromEntries(REFERRER_RULES.map(([, rule]) => [rule.key, rule.kind]));

/** What kind of place a referrer host is, and its source key; null for an unknown site (a plain referral). */
export function classifyReferrer(host: string): KnownSource | null {
  if (!host) return null;
  for (const [pattern, rule] of REFERRER_RULES) if (pattern.test(host)) return rule;
  return null;
}

/**
 * Where a session came from. A tag on the link (?ref= / ?utm_source=) wins, then the referrer's host, else "direct"
 * (typed in, a bookmark, or an app that doesn't pass a referrer — WhatsApp often doesn't). The store's own hosts
 * are not a source.
 */
export function trafficSource(input: { ref?: string | null; referrerHost?: string | null; ownHosts?: string[] }): { key: string; kind: SourceKind } {
  const tagged = normalizeSource(input.ref);
  if (tagged) return { key: tagged, kind: KIND_OF_KEY[tagged] ?? (tagged === "email" ? "email" : "tagged") };
  const host = normalizeReferrerHost(input.referrerHost ?? "");
  const own = (input.ownHosts ?? []).map((value) => normalizeReferrerHost(value)).filter(Boolean);
  if (!host || own.includes(host)) return { key: "direct", kind: "direct" };
  return classifyReferrer(host) ?? { key: "referral", kind: "referral" };
}

/** A user agent cut down to its device class; the agent itself is never stored. */
export function deviceClass(userAgent: string | null | undefined): "mobile" | "tablet" | "desktop" {
  const ua = userAgent ?? "";
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile|windows phone|kaios/i.test(ua)) return "mobile";
  return "desktop";
}

/** A two-letter country code from the hosting platform's geo header, or "". */
export function normalizeCountry(raw: string | null | undefined) {
  const code = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : "";
}

/** A city name from the hosting platform's geo header (URL-encoded), or "". */
export function normalizeCity(raw: string | null | undefined) {
  let city = raw ?? "";
  try {
    city = decodeURIComponent(city);
  } catch {
    return "";
  }
  city = city.replace(/\s+/g, " ").trim();
  return city.length <= 60 && /^[\p{L}][\p{L}\s.'-]*$/u.test(city) ? city : "";
}

/**
 * A shop search ("/shop?q=Ankara  Gown") cleaned for counting: lower case, single spaces, at most 60 characters.
 * Empty when it looks like personal data (an email, a phone number, a link) or has nothing left.
 */
export function normalizeSearchTerm(raw: unknown) {
  if (typeof raw !== "string") return "";
  const text = raw.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (!text || text.length > 80) return "";
  if (/@|https?:|www\.|\.(com|ng|net|org)\b/.test(text)) return "";
  if ((text.match(/\d/g) ?? []).length >= 7) return "";
  const clean = text.replace(/[^\p{L}\p{N} '&-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return clean.length >= 2 ? clean : "";
}

export interface TrafficBeacon {
  type: "page_view" | "engagement";
  path: StorePath;
  /** The shop search on this page, already cleaned. */
  search?: string;
  /** Present on the session's first page. */
  entry?: { ref?: string | null; referrerHost?: string | null; medium?: string | null; campaign?: string | null };
  newVisitor?: boolean;
  /** Engagement only: seconds the page was visible. */
  seconds?: number;
}

/** Longest engaged time one page report can add (a tab left open all afternoon is not 4 hours of reading). */
export const MAX_ENGAGED_SECONDS = 30 * 60;

/** The counters one beacon adds. Pure, so what is (and isn't) stored is tested. */
export function trafficIncrements(beacon: TrafficBeacon, request: { userAgent?: string | null; country?: string | null; city?: string | null; ownHosts?: string[] }): TrafficIncrement[] {
  const out: TrafficIncrement[] = [];
  const add = (metric: TrafficMetric, dim: string, value: string, amount = 1) => {
    if (amount > 0) out.push({ metric, dim, value, amount });
  };
  const path = beacon.path.path;
  if (beacon.type === "engagement") {
    const seconds = Math.min(MAX_ENGAGED_SECONDS, Math.max(0, Math.round(Number(beacon.seconds) || 0)));
    if (seconds < 1) return out;
    add("engaged_seconds", "", "", seconds);
    add("engaged_seconds", "path", path, seconds);
    add("engaged_view", "", "");
    add("engaged_view", "path", path);
    return out;
  }
  add("page_view", "", "");
  add("page_view", "path", path);
  if (beacon.search && beacon.path.kind === "shop") add("search", "term", beacon.search);
  if (beacon.newVisitor) add("new_visitor", "", "");
  if (beacon.entry) {
    const source = trafficSource({ ref: beacon.entry.ref, referrerHost: beacon.entry.referrerHost, ownHosts: request.ownHosts });
    const host = normalizeReferrerHost(beacon.entry.referrerHost ?? "");
    const ownHosts = (request.ownHosts ?? []).map((value) => normalizeReferrerHost(value));
    add("session", "", "");
    add("entry", "path", path);
    add("session", "source", source.key);
    if (host && !ownHosts.includes(host)) add("session", "referrer", host);
    add("session", "device", deviceClass(request.userAgent));
    const country = normalizeCountry(request.country);
    if (country) add("session", "country", country);
    const city = normalizeCity(request.city);
    if (city) add("session", "city", city);
    const medium = normalizeCampaign(beacon.entry.medium).slice(0, 32);
    if (medium) add("session", "medium", medium);
    const campaign = normalizeCampaign(beacon.entry.campaign);
    if (campaign) add("session", "campaign", campaign);
  }
  return out;
}

// ─── The report ───────────────────────────────────────────────────────────────

export const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct (typed in, bookmarks, apps)",
  referral: "Other websites",
  google: "Google",
  google_ads: "Google Ads",
  bing: "Bing",
  search_other: "Other search engines",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  copilot: "Microsoft Copilot",
  claude: "Claude",
  ai_other: "Other AI assistants",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  x: "X (Twitter)",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  telegram: "Telegram",
  email: "Email",
  sms: "SMS",
  online_store: "Your store links",
};

export function trafficSourceLabel(key: string) {
  return SOURCE_LABEL[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : SOURCE_LABEL.direct);
}

export function trafficSourceKind(key: string): SourceKind {
  if (key === "direct") return "direct";
  if (key === "referral") return "referral";
  if (key === "email") return "email";
  return KIND_OF_KEY[key] ?? "tagged";
}

const PAGE_LABEL: Partial<Record<PageKind, string>> = {
  home: "Home page", shop: "Shop", categories: "Categories", cart: "Bag", checkout: "Checkout", wishlist: "Wishlist",
  blog: "Blog", reviews: "Reviews", links: "Link in bio", order: "Order page", pay: "Payment link", form: "Sign-up form",
};

/** What a stored path is: its kind, and the product id for product pages. */
export function pathInfo(path: string): StorePath {
  return normalizeStorePath(path, "") ?? { path, kind: "page" };
}

/** A readable name for a stored path: the product's name for product pages, else the page's. */
export function pageLabel(path: string, productNames: Map<string, string> = new Map()) {
  const info = pathInfo(path);
  if (info.kind === "product") return productNames.get(info.productId ?? "") ?? "A product (removed)";
  const fixed = PAGE_LABEL[info.kind];
  if (fixed) return fixed;
  const words = (part: string) => part.split(/[-_.]/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  const parts = info.path.split("/").filter(Boolean);
  if (info.kind === "blog_post") return `Blog: ${words(parts[1] ?? "")}`;
  if (info.kind === "collection") return `Collection: ${words(parts[1] ?? "")}`;
  if (info.kind === "policy") return parts[1] ? `Policy: ${words(parts[1])}` : "Policies";
  return parts.map(words).join(" › ") || "Home page";
}

export interface TrafficKpis {
  sessions: number;
  pageViews: number;
  /** Distinct browsers over the whole period (HyperLogLog estimate, about ±2%): a person counts once however many days they came. */
  uniqueVisitors: number;
  /** Browsers on their first visit ever to the store (on that device). */
  newVisitors: number;
  /** Unique visitors who had been before. */
  returningVisitors: number;
  pagesPerSession: number | null;
  /** Average seconds a page stayed open and visible; null when nothing reported it. */
  avgEngagedSeconds: number | null;
  searches: number;
  productViews: number;
  addToBag: number;
  checkouts: number;
  paidOrders: number;
  /** Paid online orders per session; null without sessions. */
  conversionRate: number | null;
}

export type TrafficKpiKey = keyof TrafficKpis;

export interface CountRow {
  key: string;
  label: string;
  count: number;
  share: number;
}

export interface TrafficReport {
  kpis: TrafficKpis;
  previous: TrafficKpis;
  change: Partial<Record<TrafficKpiKey, number | null>>;
  series: Array<{ label: string; sessions: number | null; pageViews: number | null; visitors: number | null; previousSessions: number; previousPageViews: number; previousVisitors: number }>;
  topPages: Array<{ path: string; kind: PageKind; label: string; views: number; entries: number; avgSeconds: number | null }>;
  entryPages: CountRow[];
  sources: Array<CountRow & { kind: SourceKind }>;
  sourceKinds: Array<CountRow & { kind: SourceKind }>;
  referrers: CountRow[];
  devices: CountRow[];
  countries: CountRow[];
  cities: CountRow[];
  searchTerms: CountRow[];
  mediums: CountRow[];
  campaigns: CountRow[];
  products: Array<{ productId: string; name: string; image: string | null; views: number; addToBag: number; unitsSold: number; orders: number; conversionRate: number | null }>;
  funnel: Array<{ key: "sessions" | "product_view" | "add_to_cart" | "checkout_start" | "paid"; label: string; count: number }>;
  /** First day traffic was counted for this store (YYYY-MM-DD), or null. */
  since: string | null;
}

export interface TrafficInput {
  range: ResolvedRange;
  now: Date;
  /** StoreTrafficDaily rows for the current and previous period. */
  rows: TrafficRow[];
  /** StoreVisitorSketch by day (YYYY-MM-DD) for the current and previous period; a missing day counts nobody. */
  sketches?: Map<string, HllSketch>;
  /** StoreMetricDaily rows (product_view, add_to_cart, checkout_start with productId) for both periods. */
  funnelRows: Array<{ day: string; metric: string; productId: string; count: number }>;
  /** Paid online orders in both periods, with their lines. */
  orders: Array<{ createdAt: Date; items: unknown }>;
  products: Array<{ id: string; name: string; image: string | null }>;
  since: string | null;
}

function dayInRange(day: string, start: Date, end: Date) {
  const at = Date.parse(`${day}T00:00:00+01:00`);
  return at >= start.getTime() && at < end.getTime();
}

export function percentChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Adds up `count` per value for one metric and dim in [start, end). */
export function sumBy(rows: TrafficRow[], metric: string, dim: string, start: Date, end: Date) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.metric !== metric || row.dim !== dim || !dayInRange(row.day, start, end)) continue;
    map.set(row.value, (map.get(row.value) ?? 0) + row.count);
  }
  return map;
}

function total(rows: TrafficRow[], metric: string, start: Date, end: Date) {
  return sumBy(rows, metric, "", start, end).get("") ?? 0;
}

/** Distinct visitors in [start, end): the days' sketches merged register by register, then estimated. */
export function uniqueVisitorsBetween(sketches: Map<string, HllSketch> | undefined, start: Date, end: Date) {
  if (!sketches?.size) return 0;
  const days = [...sketches.entries()].filter(([day]) => dayInRange(day, start, end)).map(([, sketch]) => sketch);
  return days.length ? estimate(mergeSketches(days)) : 0;
}

/** Sorted rows with each one's share of the total, top `limit`. */
export function ranked(map: Map<string, number>, label: (key: string) => string = (key) => key, limit = 10): CountRow[] {
  const sum = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, label: label(key), count, share: sum ? count / sum : 0 }));
}

function orderLineProducts(items: unknown) {
  const out: Array<{ productId: string; quantity: number }> = [];
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.productId !== "string" || !item.productId) continue;
    out.push({ productId: item.productId, quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)) });
  }
  return out;
}

function kpisFor(input: TrafficInput, start: Date, end: Date): TrafficKpis {
  const sessions = total(input.rows, "session", start, end);
  const pageViews = total(input.rows, "page_view", start, end);
  const engagedSeconds = total(input.rows, "engaged_seconds", start, end);
  const engagedViews = total(input.rows, "engaged_view", start, end);
  const funnel = (metric: string) => input.funnelRows.reduce((sum, row) => (row.metric === metric && dayInRange(row.day, start, end) ? sum + row.count : sum), 0);
  const paidOrders = input.orders.filter((order) => order.createdAt.getTime() >= start.getTime() && order.createdAt.getTime() < end.getTime()).length;
  // The estimate is within a couple of percent. It is kept between the first-time visitors (each is a unique
  // visitor) and the visits (each visitor made at least one), so a small store never reads "3 visitors, 2 visits".
  const newVisitors = total(input.rows, "new_visitor", start, end);
  const estimated = Math.max(newVisitors, uniqueVisitorsBetween(input.sketches, start, end));
  const uniqueVisitors = sessions ? Math.min(estimated, sessions) : estimated;
  return {
    sessions,
    pageViews,
    uniqueVisitors,
    newVisitors,
    returningVisitors: Math.max(0, uniqueVisitors - newVisitors),
    pagesPerSession: sessions ? Math.round((pageViews / sessions) * 10) / 10 : null,
    avgEngagedSeconds: engagedViews ? Math.round(engagedSeconds / engagedViews) : null,
    searches: [...sumBy(input.rows, "search", "term", start, end).values()].reduce((a, b) => a + b, 0),
    productViews: funnel("product_view"),
    addToBag: funnel("add_to_cart"),
    checkouts: funnel("checkout_start"),
    paidOrders,
    conversionRate: sessions ? paidOrders / sessions : null,
  };
}

export function computeTraffic(input: TrafficInput): TrafficReport {
  const { range, now } = input;
  const { start, end } = range;
  const kpis = kpisFor(input, start, end);
  const previous = kpisFor(input, range.previous.start, range.previous.end);
  const change: TrafficReport["change"] = {};
  for (const key of Object.keys(kpis) as TrafficKpiKey[]) change[key] = percentChange(kpis[key], previous[key]);

  // Sessions and page views over time, the period before lined up bucket by bucket. Counters are daily, so "today"
  // is one point rather than 24 hours.
  const length = end.getTime() - start.getTime();
  const buckets = range.bucket === "hour" ? [{ start, end, label: range.label }] : rangeBuckets(range);
  const series = buckets.map((bucket) => {
    const future = bucket.start.getTime() > now.getTime();
    const before = (date: Date) => new Date(date.getTime() - length);
    return {
      label: bucket.label,
      sessions: future ? null : total(input.rows, "session", bucket.start, bucket.end),
      pageViews: future ? null : total(input.rows, "page_view", bucket.start, bucket.end),
      visitors: future ? null : uniqueVisitorsBetween(input.sketches, bucket.start, bucket.end),
      previousSessions: total(input.rows, "session", before(bucket.start), before(bucket.end)),
      previousPageViews: total(input.rows, "page_view", before(bucket.start), before(bucket.end)),
      previousVisitors: uniqueVisitorsBetween(input.sketches, before(bucket.start), before(bucket.end)),
    };
  });

  const productNames = new Map(input.products.map((product) => [product.id, product.name]));
  const views = sumBy(input.rows, "page_view", "path", start, end);
  const entries = sumBy(input.rows, "entry", "path", start, end);
  const seconds = sumBy(input.rows, "engaged_seconds", "path", start, end);
  const engaged = sumBy(input.rows, "engaged_view", "path", start, end);
  const topPages = [...views.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([path, count]) => {
      const info = pathInfo(path);
      const reported = engaged.get(path) ?? 0;
      return { path, kind: info.kind, label: pageLabel(path, productNames), views: count, entries: entries.get(path) ?? 0, avgSeconds: reported ? Math.round((seconds.get(path) ?? 0) / reported) : null };
    });

  const sourceCounts = sumBy(input.rows, "session", "source", start, end);
  const sources = ranked(sourceCounts, trafficSourceLabel, 12).map((row) => ({ ...row, kind: trafficSourceKind(row.key) }));
  const byKind = new Map<string, number>();
  for (const [key, count] of sourceCounts) byKind.set(trafficSourceKind(key), (byKind.get(trafficSourceKind(key)) ?? 0) + count);
  const KIND_LABEL: Record<SourceKind, string> = { search: "Search engines", ai: "AI assistants", social: "Social media", messaging: "Messaging apps", email: "Email", ads: "Ads", referral: "Other websites", direct: "Direct", tagged: "Tagged links" };
  const sourceKinds = ranked(byKind, (key) => KIND_LABEL[key as SourceKind] ?? key, 10).map((row) => ({ ...row, kind: row.key as SourceKind }));

  // Products: views and add to bag from the storefront counters, units and orders from paid orders.
  const productViews = new Map<string, number>();
  const productBag = new Map<string, number>();
  for (const row of input.funnelRows) {
    if (!row.productId || !dayInRange(row.day, start, end)) continue;
    if (row.metric === "product_view") productViews.set(row.productId, (productViews.get(row.productId) ?? 0) + row.count);
    if (row.metric === "add_to_cart") productBag.set(row.productId, (productBag.get(row.productId) ?? 0) + row.count);
  }
  const units = new Map<string, number>();
  const orderCount = new Map<string, number>();
  for (const order of input.orders) {
    if (order.createdAt.getTime() < start.getTime() || order.createdAt.getTime() >= end.getTime()) continue;
    const seen = new Set<string>();
    for (const line of orderLineProducts(order.items)) {
      units.set(line.productId, (units.get(line.productId) ?? 0) + line.quantity);
      if (!seen.has(line.productId)) orderCount.set(line.productId, (orderCount.get(line.productId) ?? 0) + 1);
      seen.add(line.productId);
    }
  }
  const productById = new Map(input.products.map((product) => [product.id, product]));
  const productIds = new Set([...productViews.keys(), ...productBag.keys(), ...orderCount.keys()]);
  const products = [...productIds]
    .filter((id) => productById.has(id))
    .map((id) => {
      const product = productById.get(id)!;
      const viewCount = productViews.get(id) ?? 0;
      const ordered = orderCount.get(id) ?? 0;
      return { productId: id, name: product.name, image: product.image, views: viewCount, addToBag: productBag.get(id) ?? 0, unitsSold: units.get(id) ?? 0, orders: ordered, conversionRate: viewCount ? ordered / viewCount : null };
    })
    .sort((a, b) => b.views - a.views || b.orders - a.orders || a.name.localeCompare(b.name))
    .slice(0, 12);

  const titleCase = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
  return {
    kpis,
    previous,
    change,
    series,
    topPages,
    entryPages: ranked(entries, (path) => pageLabel(path, productNames), 8),
    sources,
    sourceKinds,
    referrers: ranked(sumBy(input.rows, "session", "referrer", start, end), (key) => key, 10),
    devices: ranked(sumBy(input.rows, "session", "device", start, end), titleCase, 3),
    countries: ranked(sumBy(input.rows, "session", "country", start, end), (key) => key, 8),
    cities: ranked(sumBy(input.rows, "session", "city", start, end), (key) => key, 8),
    searchTerms: ranked(sumBy(input.rows, "search", "term", start, end), (key) => key, 12),
    mediums: ranked(sumBy(input.rows, "session", "medium", start, end), (key) => key, 8),
    campaigns: ranked(sumBy(input.rows, "session", "campaign", start, end), (key) => key, 8),
    products,
    funnel: [
      { key: "sessions", label: "Visits", count: kpis.sessions },
      { key: "product_view", label: "Viewed a product", count: kpis.productViews },
      { key: "add_to_cart", label: "Added to bag", count: kpis.addToBag },
      { key: "checkout_start", label: "Started checkout", count: kpis.checkouts },
      { key: "paid", label: "Paid", count: kpis.paidOrders },
    ],
    since: input.since,
  };
}

// ─── Peggy: the numbers as context ─────────────────────────────────────────────

export type TrafficSection = "overview" | "pages" | "sources" | "devices" | "products" | "search" | "places" | "google";

const secondsText = (value: number | null) => (value == null ? "not measured yet" : value >= 60 ? `${Math.floor(value / 60)}m ${value % 60}s` : `${value}s`);
const pctText = (value: number | null) => (value == null ? "n/a" : `${Math.round(value * 1000) / 10}%`);
const changeText = (value: number | null | undefined) => (value == null ? "" : ` (${value > 0 ? "+" : ""}${value}% vs before)`);
const top = (rows: CountRow[], n = 5) => rows.slice(0, n).map((row) => `${row.label} ${row.count}`).join(", ") || "none yet";

/** A compact plain-text summary of one section (or all of it), for the "Ask Peggy" prompt. Under ~1,200 characters. */
export function trafficContext(report: TrafficReport, section: TrafficSection, rangeLabel: string, extra = "") {
  const k = report.kpis;
  const c = report.change;
  const lines: string[] = [`Store traffic, ${rangeLabel}:`];
  const overview = () =>
    lines.push(
      `Visits ${k.sessions}${changeText(c.sessions)}; page views ${k.pageViews}${changeText(c.pageViews)}; unique visitors ${k.uniqueVisitors}${changeText(c.uniqueVisitors)} (new ${k.newVisitors}, returning ${k.returningVisitors}); pages per visit ${k.pagesPerSession ?? "n/a"}; time on a page ${secondsText(k.avgEngagedSeconds)}; paid orders ${k.paidOrders}; conversion ${pctText(k.conversionRate)}${changeText(c.conversionRate)}.`,
    );
  if (section === "overview") {
    overview();
    lines.push(`Where visits came from: ${top(report.sources)}.`);
    lines.push(`Top pages: ${report.topPages.slice(0, 5).map((page) => `${page.label} ${page.views}`).join(", ") || "none yet"}.`);
    lines.push(`Devices: ${top(report.devices, 3)}.`);
    lines.push(`Funnel: ${report.funnel.map((step) => `${step.label} ${step.count}`).join(" → ")}.`);
  } else if (section === "pages") {
    lines.push(`Top pages (views, avg time): ${report.topPages.slice(0, 8).map((page) => `${page.label} ${page.views} views, ${secondsText(page.avgSeconds)}`).join("; ") || "none yet"}.`);
    lines.push(`Where people land first: ${top(report.entryPages)}.`);
  } else if (section === "sources") {
    lines.push(`Visits ${k.sessions}${changeText(c.sessions)}. Sources: ${top(report.sources, 8)}.`);
    lines.push(`By kind: ${top(report.sourceKinds, 6)}. Websites: ${top(report.referrers)}. Campaign tags: ${top(report.campaigns, 4)}.`);
  } else if (section === "devices") {
    lines.push(`Devices: ${top(report.devices, 3)}.`);
  } else if (section === "products") {
    lines.push(`Products (views → added to bag → orders): ${report.products.slice(0, 6).map((p) => `${p.name}: ${p.views} → ${p.addToBag} → ${p.orders}`).join("; ") || "none yet"}.`);
    lines.push(`Funnel: ${report.funnel.map((step) => `${step.label} ${step.count}`).join(" → ")}. Conversion ${pctText(k.conversionRate)}.`);
  } else if (section === "search") {
    lines.push(`Searches on the store: ${k.searches}. Top terms: ${top(report.searchTerms, 8)}.`);
  } else if (section === "places") {
    lines.push(`Countries: ${top(report.countries)}. Cities: ${top(report.cities)}.`);
  }
  if (extra) lines.push(extra);
  return lines.join("\n").slice(0, 1400);
}

/** The message the "Ask Peggy" buttons put in Peggy's box (she also has store_traffic_report for follow-ups). */
export function askPeggyPrompt(context: string) {
  return `Explain what these numbers mean for my store and what I should do next. Keep it simple, no jargon.\n\n${context}`.slice(0, 1900);
}
