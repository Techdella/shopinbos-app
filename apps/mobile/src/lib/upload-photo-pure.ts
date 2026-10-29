// Photo uploads from the phone: the pure parts (unit-tested in tests/mobile-photo-upload.test.mjs). The device side is
// lib/upload-photo.ts.
//
// Why: every photo upload goes through our API on Vercel, which refuses request bodies over about 4.5 MB before the
// route runs (413 FUNCTION_PAYLOAD_TOO_LARGE; Android often sees the connection cut instead, which the app showed as
// "We couldn't reach Shopinbos"). Phone cameras make 4–15 MB pictures, and the picker's `quality` only re-compresses
// them at full size, so each photo is shrunk on the phone first (like the web does, src/lib/media/shrink-image.ts).

import { UPLOAD_MAX_BYTES } from "../../../../shared/media.ts";

export { UPLOAD_MAX_BYTES };

/** Product photos: the long side the shop needs (big enough to zoom, small enough to send on a slow network). */
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;
/** Photos of documents (ID, CAC, licences): larger, so the writing stays readable. */
export const DOC_MAX_SIDE = 2400;
/** A second, smaller pass when the first one is still too big to send. */
export const PHOTO_RETRY_SIDE = 1200;
export const PHOTO_RETRY_QUALITY = 0.6;
/** What one photo may weigh after shrinking (room left for the other form fields). */
export const PHOTO_BUDGET_BYTES = 3 * 1024 * 1024;
/** What several photos sent in one request may weigh together (under Vercel's limit). */
export const BATCH_BUDGET_BYTES = Math.floor(3.8 * 1024 * 1024);

/** The size to resize to so the long side is at most `maxSide` (keeps the shape), or null when it's small enough. */
export function resizeTarget(width: number | null | undefined, height: number | null | undefined, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } | null {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const long = Math.max(w, h);
  if (long <= maxSide) return null;
  const scale = maxSide / long;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** The picture's real type: from the picker's mimeType, else the file's extension; JPEG when unknown. */
export function photoMime(mimeType: string | null | undefined, uri = "", fileName?: string | null): string {
  const given = (mimeType ?? "").toLowerCase().trim();
  if (/^image\/[a-z0-9.+-]+$/.test(given)) return given === "image/jpg" ? "image/jpeg" : given;
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(fileName || uri)?.[1]?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "heic" || ext === "heif") return `image/${ext}`;
  return "image/jpeg";
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif" };

/**
 * The file name sent with the photo: always present (Android needs a name for a file part) and ending in the
 * extension of what's actually sent (a shrunk HEIC is a JPEG now). `base` is used when the picker gave no name.
 */
export function photoFileName(fileName: string | null | undefined, type: string, base = "photo"): string {
  const ext = EXT[type] ?? (type.split("/")[1] || "jpg");
  const raw = (fileName ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  const stem = raw.replace(/\.[^.]*$/, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || base;
  return `${stem}.${ext}`;
}

/**
 * Whether a picture should be redrawn on the phone before sending: everything except GIFs (they may move) and SVGs.
 * HEIC/HEIF always (the server takes JPEG, PNG, WebP), others when they're too wide or too heavy.
 */
export function shouldShrink(photo: { type: string; width?: number | null; height?: number | null; bytes?: number | null }, maxSide = PHOTO_MAX_SIDE): boolean {
  if (photo.type === "image/gif" || photo.type === "image/svg+xml") return false;
  if (photo.type === "image/heic" || photo.type === "image/heif") return true;
  if (resizeTarget(photo.width, photo.height, maxSide)) return true;
  const bytes = Number(photo.bytes);
  // Unknown size or dimensions: shrink to be safe.
  if (!Number.isFinite(bytes) || bytes <= 0) return !(Number(photo.width) > 0 && Number(photo.height) > 0);
  return bytes > 600 * 1024;
}

/** Saved as PNG when the picture may be see-through (logos), else JPEG (what WhatsApp and Facebook catalogs take). */
export const shrunkType = (type: string, keepTransparency: boolean): "image/png" | "image/jpeg" => (keepTransparency && (type === "image/png" || type === "image/webp") ? "image/png" : "image/jpeg");

/**
 * Splits photos into requests that each stay under `budget` bytes and `maxCount` files (in order). A photo of
 * unknown size counts as PHOTO_BUDGET_BYTES. Returns the indexes per request.
 */
export function batchBySize(sizes: (number | null | undefined)[], budget = BATCH_BUDGET_BYTES, maxCount = 6): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let total = 0;
  sizes.forEach((raw, index) => {
    const size = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : PHOTO_BUDGET_BYTES;
    if (current.length && (total + size > budget || current.length >= maxCount)) {
      batches.push(current);
      current = [];
      total = 0;
    }
    current.push(index);
    total += size;
  });
  if (current.length) batches.push(current);
  return batches;
}

export type UploadProblem = "offline" | "tooBig" | "server" | "rejected";

/**
 * What went wrong with an upload, by the HTTP status (0: no answer at all). A connection cut while sending a big
 * body is Vercel refusing it, not the network: that's "too big", so the seller isn't told to check a connection
 * that works.
 */
export function uploadProblem(status: number, bytes?: number | null): UploadProblem {
  if (status === 413) return "tooBig";
  if (status === 0) return Number(bytes) > UPLOAD_MAX_BYTES ? "tooBig" : "offline";
  if (status >= 500 || status === 408 || status === 429) return "server";
  return "rejected";
}

/** Whether to send again: no answer (the network dropped) or a busy server, at most `max` extra tries. */
export function shouldRetryUpload(status: number, attempt: number, bytes?: number | null, max = 2): boolean {
  if (attempt >= max) return false;
  const problem = uploadProblem(status, bytes);
  return problem === "offline" || (problem === "server" && status !== 500);
}

/** Wait before try `attempt` (1, 2, …): 1.5 s, then 4 s. */
export const retryDelayMs = (attempt: number) => (attempt <= 1 ? 1500 : 4000);
