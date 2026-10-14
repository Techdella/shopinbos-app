// Reviews: the pure parts. One review shape across sources, the rating maths, filters, signed review-link
// tokens, the Google product ratings feed and the embeddable widget script. No server imports, so all of it
// is unit-tested in tests/behaviour.test.mjs.

import { createHmac, timingSafeEqual } from "node:crypto";

// ─── Sources ──────────────────────────────────────────────────────────────────

export const REVIEW_SOURCES = {
  store: { label: "Your store", group: "store" },
  google: { label: "Google", group: "google" },
  whatsapp: { label: "WhatsApp", group: "social" },
  instagram: { label: "Instagram", group: "social" },
  facebook: { label: "Facebook", group: "social" },
  tiktok: { label: "TikTok", group: "social" },
  x: { label: "X", group: "social" },
  jumia: { label: "Jumia", group: "marketplace" },
  konga: { label: "Konga", group: "marketplace" },
  marketplace: { label: "Other marketplace", group: "marketplace" },
  other: { label: "Other", group: "other" },
} as const;

export type ReviewSource = keyof typeof REVIEW_SOURCES;
/** Sources a seller can import into (everything except the store's own form). */
export const IMPORT_SOURCES = (Object.keys(REVIEW_SOURCES) as ReviewSource[]).filter((source) => source !== "store");
export const SOCIAL_SOURCES: ReviewSource[] = ["whatsapp", "instagram", "facebook", "tiktok", "x"];
export const MARKETPLACE_SOURCES: ReviewSource[] = ["jumia", "konga", "marketplace"];

export function isReviewSource(value: unknown): value is ReviewSource {
  return typeof value === "string" && value in REVIEW_SOURCES;
}

export function sourceLabel(source: string) {
  return isReviewSource(source) ? REVIEW_SOURCES[source].label : "Other";
}

export type ReviewStatusValue = "approved" | "pending" | "rejected";
export const STATUS_LABEL: Record<ReviewStatusValue, string> = { approved: "Published", pending: "Waiting", rejected: "Hidden" };
export const REVIEW_STATUSES = ["approved", "pending", "rejected"] as const satisfies readonly ReviewStatusValue[];

export function isReviewStatus(value: unknown): value is ReviewStatusValue {
  return typeof value === "string" && (REVIEW_STATUSES as readonly string[]).includes(value);
}

/**
 * The row change for "Publish / Move to waiting / Hide" or "Feature / Unfeature". Featured reviews show first on
 * the wall, the widget and share pages, so featuring also publishes; unfeaturing leaves the status alone.
 */
export function reviewModerationData(change: { status: ReviewStatusValue } | { featured: boolean }): { status?: ReviewStatusValue; featured?: boolean } {
  if ("featured" in change) return change.featured ? { featured: true, status: "approved" } : { featured: false };
  return { status: change.status };
}

// ─── One review across sources ────────────────────────────────────────────────

export interface ReviewItem {
  /** "store:<id>" for the store's own reviews, "ext:<id>" for imported ones. */
  key: string;
  kind: "store" | "external";
  id: string;
  source: ReviewSource;
  /** form = left on the store; api = imported from Google; manual = pasted; screenshot = read from an image. */
  importMethod: "form" | "api" | "manual" | "screenshot";
  authorName: string;
  authorEmail: string | null;
  authorPhotoUrl: string | null;
  rating: number | null;
  title: string;
  body: string;
  images: string[];
  status: ReviewStatusValue;
  featured: boolean;
  verifiedBuyer: boolean;
  productId: string | null;
  orderId: string | null;
  reply: string | null;
  repliedAt: string | null;
  sourceUrl: string | null;
  /** When the customer wrote it (ISO). */
  createdAt: string;
}

export function reviewKey(kind: "store" | "external", id: string) {
  return `${kind === "store" ? "store" : "ext"}:${id}`;
}

export function parseReviewKey(key: string): { kind: "store" | "external"; id: string } | null {
  const match = /^(store|ext):([A-Za-z0-9_-]{1,64})$/.exec(key);
  if (!match) return null;
  return { kind: match[1] === "store" ? "store" : "external", id: match[2] };
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asStatus(value: string): ReviewStatusValue {
  return value === "approved" || value === "rejected" ? value : "pending";
}

export function validRating(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

export function fromStoreReview(row: {
  id: string; productId: string; orderId: string; buyerName: string; buyerEmail: string; rating: number; title: string | null; body: string | null;
  images: string[] | null; status: string; featured?: boolean | null; sellerReply: string | null; repliedAt: Date | string | null; createdAt: Date | string;
}): ReviewItem {
  return {
    key: reviewKey("store", row.id),
    kind: "store",
    id: row.id,
    source: "store",
    importMethod: "form",
    authorName: row.buyerName,
    authorEmail: row.buyerEmail || null,
    authorPhotoUrl: null,
    rating: validRating(row.rating),
    title: row.title ?? "",
    body: row.body ?? "",
    images: row.images ?? [],
    status: asStatus(row.status),
    featured: Boolean(row.featured),
    // The store's form only accepts reviews tied to a real order for the buyer's email.
    verifiedBuyer: true,
    productId: row.productId,
    orderId: row.orderId,
    reply: row.sellerReply?.trim() ? row.sellerReply : null,
    repliedAt: iso(row.repliedAt),
    sourceUrl: null,
    createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
  };
}

export function fromExternalReview(row: {
  id: string; source: string; importMethod: string; productId: string | null; authorName: string; authorPhotoUrl: string | null; rating: number | null;
  title: string; body: string; images: string[]; status: string; featured: boolean; verifiedBuyer: boolean; orderId: string | null;
  reply: string | null; repliedAt: Date | string | null; sourceUrl: string | null; reviewedAt: Date | string;
}): ReviewItem {
  const method = row.importMethod === "api" || row.importMethod === "screenshot" ? row.importMethod : "manual";
  return {
    key: reviewKey("external", row.id),
    kind: "external",
    id: row.id,
    source: isReviewSource(row.source) && row.source !== "store" ? row.source : "other",
    importMethod: method,
    authorName: row.authorName,
    authorEmail: null,
    authorPhotoUrl: row.authorPhotoUrl,
    rating: validRating(row.rating),
    title: row.title,
    body: row.body,
    images: row.images ?? [],
    status: asStatus(row.status),
    featured: row.featured,
    verifiedBuyer: row.verifiedBuyer,
    productId: row.productId,
    orderId: row.orderId,
    reply: row.reply?.trim() ? row.reply : null,
    repliedAt: iso(row.repliedAt),
    sourceUrl: row.sourceUrl,
    createdAt: iso(row.reviewedAt) ?? new Date(0).toISOString(),
  };
}

/** Newest first; featured reviews first when `featuredFirst`. */
export function sortReviews(items: ReviewItem[], featuredFirst = false) {
  return [...items].sort((a, b) => (featuredFirst && a.featured !== b.featured ? (a.featured ? -1 : 1) : b.createdAt.localeCompare(a.createdAt)));
}

// ─── Rating maths ─────────────────────────────────────────────────────────────

/** One decimal, half up (4.25 → 4.3). 0 when there are no ratings. */
export function roundRating(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10 + 1e-9) / 10;
}

export interface ReviewSummary {
  count: number;
  /** Reviews with a star rating (a pasted WhatsApp message may have none). */
  rated: number;
  average: number;
  /** distribution[0] = 1 star … distribution[4] = 5 stars. */
  distribution: [number, number, number, number, number];
  /** Share of reviews with a seller reply, 0-100 (hidden reviews don't count). */
  responseRate: number;
  needsReply: number;
  pending: number;
  hidden: number;
  featured: number;
  withPhotos: number;
  bySource: Partial<Record<ReviewSource, { count: number; average: number }>>;
}

export function summarizeReviews(items: ReviewItem[]): ReviewSummary {
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const sources: Partial<Record<ReviewSource, { count: number; sum: number; rated: number }>> = {};
  let sum = 0;
  let rated = 0;
  let visible = 0;
  let replied = 0;
  let pending = 0;
  let hidden = 0;
  let featured = 0;
  let withPhotos = 0;
  for (const item of items) {
    const source = (sources[item.source] ??= { count: 0, sum: 0, rated: 0 });
    source.count++;
    if (item.rating) {
      distribution[item.rating - 1]++;
      sum += item.rating;
      rated++;
      source.sum += item.rating;
      source.rated++;
    }
    if (item.status === "rejected") hidden++;
    else {
      visible++;
      if (item.reply) replied++;
    }
    if (item.status === "pending") pending++;
    if (item.featured) featured++;
    if (item.images.length) withPhotos++;
  }
  const bySource: ReviewSummary["bySource"] = {};
  for (const [key, value] of Object.entries(sources) as Array<[ReviewSource, { count: number; sum: number; rated: number }]>) {
    bySource[key] = { count: value.count, average: value.rated ? roundRating(value.sum / value.rated) : 0 };
  }
  return {
    count: items.length,
    rated,
    average: rated ? roundRating(sum / rated) : 0,
    distribution,
    responseRate: visible ? Math.round((replied / visible) * 100) : 0,
    needsReply: visible - replied,
    pending,
    hidden,
    featured,
    withPhotos,
    bySource,
  };
}

/** Percent of rated reviews per star, rounded so the bars read naturally (may not sum to exactly 100). */
export function distributionPercents(distribution: number[]) {
  const total = distribution.reduce((sum, n) => sum + n, 0);
  return distribution.map((n) => (total ? Math.round((n / total) * 100) : 0));
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ReviewFilters {
  rating?: number | null;
  source?: string | null;
  status?: string | null;
  productId?: string | null;
  hasPhoto?: boolean;
  needsReply?: boolean;
  featured?: boolean;
  q?: string | null;
}

/** Reads ?rating=&source=&status=&product=&photo=1&reply=needed&featured=1&q= into filters. */
export function parseReviewFilters(params: Record<string, string | string[] | undefined>): ReviewFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() || null;
  };
  const status = one("status");
  const source = one("source");
  return {
    rating: validRating(one("rating")),
    source: source && (isReviewSource(source) || ["social", "marketplace", "imported"].includes(source)) ? source : null,
    status: status && ["approved", "pending", "rejected"].includes(status) ? status : null,
    productId: one("product"),
    hasPhoto: one("photo") === "1",
    needsReply: one("reply") === "needed",
    featured: one("featured") === "1",
    q: one("q")?.slice(0, 120) ?? null,
  };
}

export function filterReviews(items: ReviewItem[], filters: ReviewFilters) {
  const q = filters.q?.toLowerCase();
  return items.filter((item) => {
    if (filters.rating && item.rating !== filters.rating) return false;
    if (filters.source) {
      if (filters.source === "imported") {
        if (item.kind !== "external") return false;
      } else if (filters.source === "social" || filters.source === "marketplace") {
        if (REVIEW_SOURCES[item.source].group !== filters.source) return false;
      } else if (item.source !== filters.source) return false;
    }
    if (filters.status && item.status !== filters.status) return false;
    if (filters.productId && item.productId !== filters.productId) return false;
    if (filters.hasPhoto && !item.images.length) return false;
    if (filters.needsReply && (item.reply || item.status === "rejected")) return false;
    if (filters.featured && !item.featured) return false;
    if (q && !`${item.authorName} ${item.title} ${item.body} ${item.reply ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** What the store shows the public: published reviews only. */
export function publicReviews(items: ReviewItem[]) {
  return sortReviews(items.filter((item) => item.status === "approved"), true);
}

/** "Ada Okafor" → "Ada O." for the public wall and widget; single names stay as they are. */
export function publicName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Customer";
  if (parts.length === 1) return parts[0].slice(0, 40);
  return `${parts[0].slice(0, 40)} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

// ─── Review links ─────────────────────────────────────────────────────────────

function signature(requestId: string, secret: string) {
  return createHmac("sha256", secret).update(`review-request:${requestId}`).digest("base64url").slice(0, 32);
}

/** The token in /s/[slug]/review/<token>: the request id and an HMAC of it, so links can't be guessed or altered. */
export function signReviewToken(requestId: string, secret: string) {
  if (!secret) throw new Error("A review link secret is required");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestId)) throw new Error("Invalid review request id");
  return `${requestId}.${signature(requestId, secret)}`;
}

/** The request id when the token is genuine, else null. */
export function verifyReviewToken(token: string, secret: string): string | null {
  if (!secret || typeof token !== "string" || token.length > 120) return null;
  const match = /^([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!match) return null;
  const expected = Buffer.from(signature(match[1], secret));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null;
}

/** Review links stay usable for this long after the request was sent. */
export const REVIEW_LINK_DAYS = 60;

export function reviewLinkExpired(createdAt: Date | string, now = new Date()) {
  return now.getTime() - new Date(createdAt).getTime() > REVIEW_LINK_DAYS * 86_400_000;
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export type RequestChannel = "email" | "sms" | "whatsapp" | "link";
export const REQUEST_CHANNELS = ["email", "sms", "whatsapp", "link"] as const satisfies readonly RequestChannel[];

/** Which ways a buyer can be asked: email needs an address, SMS and WhatsApp a phone, a link always works. */
export function requestReach(order: { buyerEmail: string | null; buyerPhone: string | null }): Record<RequestChannel, boolean> {
  const email = Boolean(order.buyerEmail?.includes("@"));
  const phone = Boolean(order.buyerPhone);
  return { email, sms: phone, whatsapp: phone, link: true };
}

/** Orders that are due an automatic request: delivered at least `delayDays` ago (and within 30 days), never asked. */
export function ordersDueForRequest<T extends { id: string; status: string; deliveredAt: Date | string | null; updatedAt?: Date | string }>(
  orders: T[],
  alreadyAsked: Set<string>,
  delayDays: number,
  now = new Date(),
) {
  const day = 86_400_000;
  return orders.filter((order) => {
    if (order.status !== "delivered" || alreadyAsked.has(order.id)) return false;
    const delivered = order.deliveredAt ?? order.updatedAt;
    if (!delivered) return false;
    const age = now.getTime() - new Date(delivered).getTime();
    return age >= Math.max(0, delayDays) * day && age <= 30 * day;
  });
}

export function reviewRequestMessage(input: { storeName: string; customerName: string; link: string }) {
  const first = input.customerName.trim().split(/\s+/)[0] || "there";
  const text = `Hi ${first}, thank you for shopping with ${input.storeName}. How was your order? It takes a minute to leave a review: ${input.link}`;
  return {
    subject: `How was your order from ${input.storeName}?`,
    text,
    sms: text.slice(0, 300),
  };
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

export function reviewShareText(item: Pick<ReviewItem, "rating" | "body" | "title" | "authorName">, storeName: string) {
  const stars = item.rating ? `${"★".repeat(item.rating)}${"☆".repeat(5 - item.rating)} ` : "";
  const words = (item.body || item.title).trim().replace(/\s+/g, " ");
  const quote = words.length > 220 ? `${words.slice(0, 217).trimEnd()}…` : words;
  return `${stars}"${quote}" — ${publicName(item.authorName)}, customer of ${storeName}`;
}

export function shareLinks(url: string, text: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://x.com/intent/post?text=${t}&url=${u}`,
  };
}

// ─── Google ───────────────────────────────────────────────────────────────────

const GOOGLE_STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function googleStarRating(value: unknown) {
  return typeof value === "string" ? (GOOGLE_STARS[value] ?? null) : null;
}

/** A Google review from the Business Profile API (v4) as an ExternalReview row. */
export function googleReviewToRow(review: Record<string, unknown>) {
  const reviewer = (review.reviewer ?? {}) as Record<string, unknown>;
  const reply = (review.reviewReply ?? null) as Record<string, unknown> | null;
  const name = typeof review.name === "string" ? review.name : null;
  if (!name) return null;
  const comment = typeof review.comment === "string" ? review.comment : "";
  // Google appends machine translations after this marker; keep only what the customer wrote.
  const original = comment.includes("(Original)") ? comment.split("(Original)").pop()!.trim() : comment.split("(Translated by Google)")[0].trim();
  return {
    externalId: name,
    authorName: reviewer.isAnonymous ? "A Google user" : String(reviewer.displayName || "A Google user").slice(0, 120),
    authorPhotoUrl: typeof reviewer.profilePhotoUrl === "string" ? reviewer.profilePhotoUrl : null,
    rating: googleStarRating(review.starRating),
    body: original.slice(0, 5000),
    reviewedAt: typeof review.createTime === "string" ? new Date(review.createTime) : new Date(),
    reply: reply && typeof reply.comment === "string" ? reply.comment : null,
    repliedAt: reply && typeof reply.updateTime === "string" ? new Date(reply.updateTime) : null,
  };
}

// ─── Screenshot extraction ────────────────────────────────────────────────────

export interface ExtractedReview {
  authorName: string;
  rating: number | null;
  body: string;
  reviewedAt: string | null;
  source: ReviewSource | null;
}

/** Cleans what the vision model read off a screenshot. The seller confirms every field before saving. */
export function normalizeExtracted(raw: Record<string, unknown> | null): ExtractedReview {
  const value = raw ?? {};
  const text = (key: string, max: number) => (typeof value[key] === "string" ? (value[key] as string).trim().slice(0, max) : "");
  const date = text("date", 40);
  const parsed = date ? new Date(date) : null;
  const source = text("source", 20).toLowerCase();
  return {
    authorName: text("authorName", 120),
    rating: validRating(typeof value.rating === "number" ? Math.round(value.rating) : value.rating),
    body: text("text", 5000),
    reviewedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    source: isReviewSource(source) && source !== "store" ? source : null,
  };
}

// ─── Google product ratings feed ──────────────────────────────────────────────

export function escapeXml(value: string) {
  return value
    // Characters XML 1.0 can't carry at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface FeedReview {
  id: string;
  authorName: string;
  createdAt: string;
  title: string;
  body: string;
  rating: number;
  reviewUrl: string;
  images: string[];
  collectionMethod: "unsolicited" | "post_fulfillment";
  orderId?: string | null;
  product: { id: string; name: string; url: string; sku?: string | null };
}

/**
 * Google's Product Reviews feed (schema 2.3). Elements are written in the order the XSD requires. Reviews
 * without text are skipped because <content> is required.
 */
export function buildProductRatingsFeed(input: { storeName: string; storeUrl: string; faviconUrl?: string | null; reviews: FeedReview[] }) {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd">',
    "  <version>2.3</version>",
    "  <aggregator><name>Shopinbos</name></aggregator>",
    `  <publisher><name>${escapeXml(input.storeName)}</name>${input.faviconUrl ? `<favicon>${escapeXml(input.faviconUrl)}</favicon>` : ""}</publisher>`,
    "  <reviews>",
  ];
  for (const review of input.reviews) {
    const content = review.body.trim() || review.title.trim();
    if (!content || !validRating(review.rating)) continue;
    lines.push(
      "    <review>",
      `      <review_id>${escapeXml(review.id)}</review_id>`,
      `      <reviewer><name>${escapeXml(publicName(review.authorName))}</name></reviewer>`,
      `      <review_timestamp>${escapeXml(new Date(review.createdAt).toISOString())}</review_timestamp>`,
      ...(review.title.trim() ? [`      <title>${escapeXml(review.title.trim())}</title>`] : []),
      `      <content>${escapeXml(content)}</content>`,
      `      <review_url type="singleton">${escapeXml(review.reviewUrl)}</review_url>`,
      ...(review.images.length
        ? ["      <reviewer_images>", ...review.images.slice(0, 10).map((url) => `        <reviewer_image><url>${escapeXml(url)}</url></reviewer_image>`), "      </reviewer_images>"]
        : []),
      `      <ratings><overall min="1" max="5">${review.rating}</overall></ratings>`,
      "      <products>",
      "        <product>",
      `          <product_ids><skus><sku>${escapeXml(review.product.sku || review.product.id)}</sku></skus></product_ids>`,
      `          <product_name>${escapeXml(review.product.name)}</product_name>`,
      `          <product_url>${escapeXml(review.product.url)}</product_url>`,
      "        </product>",
      "      </products>",
      "      <is_spam>false</is_spam>",
      `      <collection_method>${review.collectionMethod}</collection_method>`,
      ...(review.orderId ? [`      <transaction_id>${escapeXml(review.orderId)}</transaction_id>`] : []),
      "    </review>",
    );
  }
  lines.push("  </reviews>", "</feed>");
  return `${lines.join("\n")}\n`;
}

// ─── Embeddable widget ────────────────────────────────────────────────────────

export interface WidgetPayload {
  storeName: string;
  wallUrl: string;
  average: number;
  count: number;
  reviews: Array<{ name: string; rating: number | null; text: string; source: string; date: string }>;
}

/**
 * The script sellers paste on another site. It renders into a shadow root next to the <script> tag (or into
 * an element with data-shopinbos-reviews) using textContent only, so review text can never inject markup.
 */
export function buildWidgetScript(payload: WidgetPayload) {
  const data = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `(function(){
var d=${data};
var s=document.currentScript;
var host=document.querySelector("[data-shopinbos-reviews]")||document.createElement("div");
if(!host.parentNode&&s&&s.parentNode){s.parentNode.insertBefore(host,s.nextSibling);}
if(host.shadowRoot)return;
var root=host.attachShadow?host.attachShadow({mode:"open"}):host;
function el(t,c,txt){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e;}
function stars(n){return n?"\\u2605\\u2605\\u2605\\u2605\\u2605".slice(0,n)+"\\u2606\\u2606\\u2606\\u2606\\u2606".slice(0,5-n):"";}
var st=el("style");st.textContent=".w{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16141F;border:1px solid #E6E1F0;border-radius:18px;padding:16px;background:#fff;max-width:100%;box-sizing:border-box}.h{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin-bottom:12px}.a{font-size:28px;font-weight:800}.s{color:#E8A23A;letter-spacing:1px}.m{color:#6B6878;font-size:13px}.g{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}.c{border:1px solid #E6E1F0;border-radius:14px;padding:12px}.t{margin:6px 0;font-size:14px;line-height:1.5}.f{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#6B6878}.l{display:inline-block;margin-top:12px;color:#16141F;font-weight:700;font-size:14px}";
root.appendChild(st);
var w=el("div","w");var h=el("div","h");
if(d.count){h.appendChild(el("span","a",d.average.toFixed(1)));h.appendChild(el("span","s",stars(Math.round(d.average))));h.appendChild(el("span","m",d.count+(d.count===1?" review":" reviews")+" for "+d.storeName));}
else{h.appendChild(el("span","m","No reviews yet for "+d.storeName));}
w.appendChild(h);var g=el("div","g");
d.reviews.forEach(function(r){var c=el("div","c");if(r.rating)c.appendChild(el("div","s",stars(r.rating)));c.appendChild(el("p","t",r.text));var f=el("div","f");f.appendChild(el("span",null,r.name));f.appendChild(el("span",null,r.source));c.appendChild(f);g.appendChild(c);});
w.appendChild(g);var a=el("a","l","See all reviews");a.href=d.wallUrl;a.target="_blank";a.rel="noopener";w.appendChild(a);
root.appendChild(w);
})();
`;
}
