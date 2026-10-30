// Product videos, "Post to Plug" (pilot feature post_to_plug): the pure rules. A seller or a supplier posts a short
// vertical video (up to 60 seconds, 50 MB) tagged to one of their own products. The file goes STRAIGHT to Storage with
// a one-time signed URL from POST /api/app/product-videos/upload-url (never through a Vercel function: bodies over
// ~4.5 MB are refused), under product-videos/<store|supplier>/<ownerId>/, or a finished Rex reel is used instead.
// Saving (POST /api/app/product-videos) checks the URL is this owner's, and the stored file really is a video under
// the size cap. "Show on Plug Discover" puts it in GET /api/public/discover.
//
// Everything stays behind the post_to_plug switch for the pilot: the Videos sections only show when it is on, the
// API refuses when it is off, and the shop page and the Discover feed only show videos of shops (and suppliers) it is
// on for. A supplier's video shows on a shop's page only for a product that shop imported from that supplier, and
// never with the supplier's name or logo (tests/no-supplier-branding.test.mjs).
//
// Import-free apart from the status video rules, so the phone, the server and tests/product-videos.test.mjs load it.

import { baseType, pickerDurationMs } from "./status-video.ts";

export const POST_TO_PLUG = "post_to_plug";

/** The longest product video (a little slack for a picker that rounds up). */
export const PRODUCT_VIDEO_MAX_MS = 60_000;
const DURATION_SLACK_MS = 1_000;
/** The largest product video file. */
export const PRODUCT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const PRODUCT_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const PRODUCT_POSTER_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Signed upload URLs per account per day (video and poster counted apart). */
export const PRODUCT_VIDEO_UPLOADS_PER_DAY = 30;
/** Videos one product may carry (hidden ones count; removed ones don't). */
export const MAX_VIDEOS_PER_PRODUCT = 6;
/** How many a product page shows. */
export const STOREFRONT_VIDEO_LIMIT = 6;
export const CAPTION_MAX = 200;

export const OWNER_KINDS = ["store", "supplier"] as const;
export type OwnerKind = (typeof OWNER_KINDS)[number];
export const VIDEO_STATUSES = ["active", "hidden", "removed"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export { pickerDurationMs };

const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };
const POSTER_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const isProductVideoType = (type: unknown) => (PRODUCT_VIDEO_TYPES as readonly string[]).includes(baseType(type));
export const isProductPosterType = (type: unknown) => (PRODUCT_POSTER_TYPES as readonly string[]).includes(baseType(type));

export type ProductVideoProblem = "type" | "empty" | "too_big" | "too_long";

/** Why this video can't be posted, or null. Unknown size or length (null) is checked later (stored file, picker). */
export function productVideoProblem(input: { type: unknown; size: number | null | undefined; durationMs?: number | null }): ProductVideoProblem | null {
  if (!isProductVideoType(input.type)) return "type";
  const size = Number(input.size);
  if (input.size != null && (!Number.isFinite(size) || size <= 0)) return "empty";
  if (Number.isFinite(size) && size > PRODUCT_VIDEO_MAX_BYTES) return "too_big";
  if (input.durationMs != null && Number(input.durationMs) > PRODUCT_VIDEO_MAX_MS + DURATION_SLACK_MS) return "too_long";
  return null;
}

export function productPosterProblem(input: { type: unknown; size: number | null | undefined }): "type" | "empty" | "too_big" | null {
  if (!isProductPosterType(input.type)) return "type";
  const size = Number(input.size);
  if (input.size != null && (!Number.isFinite(size) || size <= 0)) return "empty";
  if (Number.isFinite(size) && size > PRODUCT_POSTER_MAX_BYTES) return "too_big";
  return null;
}

/** The length to store: whole milliseconds within 1..60 000 (+ slack), or null when unknown or nonsense. */
export function cleanVideoDurationMs(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const ms = Math.round(Number(value));
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, PRODUCT_VIDEO_MAX_MS + DURATION_SLACK_MS);
}

/** A pixel size to store (1..10 000), or null. */
export function cleanDimension(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 && n <= 10_000 ? n : null;
}

export type Orientation = "vertical" | "square" | "horizontal";

/** Taller than wide (by more than 10%) is vertical; within 10% square; else horizontal. Null when unknown. */
export function orientationOf(width: unknown, height: unknown): Orientation | null {
  const w = cleanDimension(width);
  const h = cleanDimension(height);
  if (!w || !h) return null;
  const ratio = h / w;
  if (ratio > 1.1) return "vertical";
  if (ratio >= 1 / 1.1) return "square";
  return "horizontal";
}

/** Vertical is preferred: anything else is allowed, with a warning. Unknown size: no warning. */
export function shouldWarnNotVertical(width: unknown, height: unknown) {
  const orientation = orientationOf(width, height);
  return orientation !== null && orientation !== "vertical";
}

/** A caption: one paragraph, trimmed, at most CAPTION_MAX characters. */
export function cleanCaption(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CAPTION_MAX);
}

/** "Show on Plug Discover" when a video is posted: on while post_to_plug is on for the owner, else off. */
export function defaultShowOnDiscover(postToPlugOn: boolean) {
  return postToPlugOn === true;
}

/** In the Discover feed: active, switched on by the owner, and the owner's shop is in the pilot. */
export function onDiscover(video: { status: string; showOnDiscover: boolean }, ownerInPilot: boolean) {
  return ownerInPilot && video.status === "active" && video.showOnDiscover === true;
}

/** The status the owner may set from the Videos section (removing is DELETE). */
export function nextStatus(current: string, wanted: unknown): VideoStatus | null {
  if (current === "removed") return null;
  return wanted === "active" || wanted === "hidden" ? wanted : null;
}

// ─── Where the files live ─────────────────────────────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The owner's folder in the public media bucket. */
export function productVideoDir(ownerKind: OwnerKind, ownerId: string) {
  if (!(OWNER_KINDS as readonly string[]).includes(ownerKind) || !ID.test(ownerId)) throw new Error("Bad owner");
  return `product-videos/${ownerKind}/${ownerId}`;
}

/** A fresh, unguessable path for an uploaded video or poster; the extension comes from the checked type. */
export function productVideoPath(ownerKind: OwnerKind, ownerId: string, kind: "video" | "poster", type: string, id: string, now = Date.now()) {
  const ext = kind === "video" ? VIDEO_EXT[baseType(type)] : POSTER_EXT[baseType(type)];
  if (!ext) throw new Error(kind === "video" ? "Not a product video type" : "Not a poster type");
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) throw new Error("Bad id");
  return `${productVideoDir(ownerKind, ownerId)}/${now}-${id}${kind === "poster" ? "-poster" : ""}.${ext}`;
}

/**
 * A video (or poster) must be one this owner uploaded with a signed URL: a public URL in our bucket under
 * product-videos/<kind>/<ownerId>/ (https, or http for a local Supabase on loopback), with a video extension for
 * "video" and "-poster" + an image extension for "poster".
 */
export function isProductVideoUrl(url: unknown, options: { supabaseUrl: string | null | undefined; bucket: string; ownerKind: OwnerKind; ownerId: string; kind?: "video" | "poster" }) {
  if (typeof url !== "string" || !options.supabaseUrl) return false;
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(options.supabaseUrl);
  } catch {
    return false;
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (target.protocol !== "https:" && !(loopback && target.protocol === "http:")) return false;
  if (target.protocol !== base.protocol || target.host !== base.host) return false;
  if (target.username || target.password || target.search || target.hash) return false;
  let dir: string;
  try {
    dir = productVideoDir(options.ownerKind, options.ownerId);
  } catch {
    return false;
  }
  const prefix = `/storage/v1/object/public/${options.bucket}/${dir}/`;
  let path: string;
  try {
    path = decodeURIComponent(target.pathname);
  } catch {
    return false;
  }
  const name = path.slice(prefix.length);
  const video = (options.kind ?? "video") === "video";
  const named = video ? /\.(mp4|mov)$/i.test(name) && !/-poster\./i.test(name) : /-poster\.(jpe?g|png|webp)$/i.test(name);
  return path.startsWith(prefix) && !name.includes("/") && !path.includes("..") && named;
}

// ─── Rex reels ────────────────────────────────────────────────────────────────

/** A Rex video can be used when it's finished (has its file) and is no longer than a product video may be. */
export function rexReelUsable(project: { videoUrl?: string | null; seconds?: number | null }) {
  if (!project.videoUrl || !/^https:\/\//i.test(project.videoUrl)) return false;
  const seconds = Number(project.seconds);
  return !(Number.isFinite(seconds) && seconds * 1000 > PRODUCT_VIDEO_MAX_MS + DURATION_SLACK_MS);
}

// ─── The shop's product page ──────────────────────────────────────────────────

export type ShopperVideo = { id: string; videoUrl: string; posterUrl: string | null; durationMs: number | null; width: number | null; height: number | null; caption: string };

type VideoRow = {
  id: string;
  ownerKind: string;
  storeId?: string | null;
  supplierId?: string | null;
  productId: string;
  videoUrl: string;
  posterUrl?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  status: string;
  createdAt?: Date | string | null;
};

/** Only what a shopper's page needs: never who posted it (a supplier's name or id never leaves the server). */
export function videoForShoppers(row: VideoRow): ShopperVideo {
  return {
    id: row.id,
    videoUrl: row.videoUrl,
    posterUrl: row.posterUrl ?? null,
    durationMs: row.durationMs ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    caption: cleanCaption(row.caption),
  };
}

/**
 * The videos a shop's product page shows, newest first: the shop's own active videos of this product, then (for a
 * product imported from a supplier) the supplier's active videos of that supplier product. Only while post_to_plug
 * is on for the shop, and for the supplier's videos also for the supplier.
 */
export function storefrontVideos(
  rows: readonly VideoRow[],
  input: { storeId: string; productId: string; supplierProductId?: string | null; supplierId?: string | null; storeInPilot: boolean; supplierInPilot: boolean },
): ShopperVideo[] {
  if (!input.storeInPilot) return [];
  const time = (row: VideoRow) => (row.createdAt ? new Date(row.createdAt).getTime() : 0);
  const own = rows.filter((row) => row.status === "active" && row.ownerKind === "store" && row.storeId === input.storeId && row.productId === input.productId);
  const fromSupplier = input.supplierProductId && input.supplierId && input.supplierInPilot
    ? rows.filter((row) => row.status === "active" && row.ownerKind === "supplier" && row.supplierId === input.supplierId && row.productId === input.supplierProductId)
    : [];
  const byNewest = (a: VideoRow, b: VideoRow) => time(b) - time(a);
  return [...own.sort(byNewest), ...fromSupplier.sort(byNewest)].slice(0, STOREFRONT_VIDEO_LIMIT).map(videoForShoppers);
}

// ─── Plug Discover ────────────────────────────────────────────────────────────

export const DISCOVER_PAGE_SIZE = 12;

/** The feed's cursor: the last video's time and id ("1767225600000_ckv…"). */
export function discoverCursor(row: { createdAt: Date | string; id: string }) {
  return `${new Date(row.createdAt).getTime()}_${row.id}`;
}

export function readDiscoverCursor(value: unknown): { createdAt: Date; id: string } | null {
  const match = /^(\d{10,15})_([A-Za-z0-9_-]{1,64})$/.exec(String(value ?? ""));
  if (!match) return null;
  const createdAt = new Date(Number(match[1]));
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: match[2]! };
}

/** "Yaba ", "yaba-lagos" → "yaba lagos": an area to compare. */
export function areaKey(value: unknown) {
  return String(value ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
}

/** Does a shop in this place match the area asked for (its area, city or state)? No area asked: every shop. */
export function areaMatches(area: unknown, place: { state?: string | null; city?: string | null; area?: string | null } | null | undefined) {
  const wanted = areaKey(area);
  if (!wanted) return true;
  if (!place) return false;
  return [place.area, place.city, place.state].some((part) => areaKey(part) === wanted);
}

/** A Discover entry: no person's details, only the video, the product and the shop's public handle and link. */
export function discoverEntry(
  row: VideoRow & { views?: number | null; createdAt: Date | string },
  product: { id: string; name: string; retailPrice: number; currency: string; shortCode?: string | null },
  shop: { handle: string | null; name: string; url: string },
) {
  return {
    id: row.id,
    videoUrl: row.videoUrl,
    posterUrl: row.posterUrl ?? null,
    durationMs: row.durationMs ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    caption: cleanCaption(row.caption),
    views: Math.max(0, Number(row.views ?? 0)),
    createdAt: new Date(row.createdAt).toISOString(),
    product: { id: product.id, name: product.name, price: product.retailPrice, currency: product.currency, shortCode: product.shortCode ?? null, url: `${shop.url.replace(/\/+$/, "")}/product/${encodeURIComponent(product.id)}` },
    shop: { handle: shop.handle, name: shop.name, url: shop.url },
  };
}

/** A video id from a request (a cuid), or null. */
export function videoId(value: unknown) {
  const id = String(value ?? "");
  return /^[a-z0-9]{10,40}$/i.test(id) ? id : null;
}
