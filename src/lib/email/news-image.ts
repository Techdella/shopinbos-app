// Images for product news emails, uploaded on /admin/product-news (POST /api/admin/product-news/image). Pure (the
// content sniffing is the shared one in src/lib/security/upload-sniff.ts), so tests/email-retry-and-upload.test.mjs
// can check the rules without a server.

import { uploadContentProblem } from "../security/upload-sniff.ts";

/** What the bucket (shopinbos-media allows jpeg/png/webp/gif/svg/csv/pdf) and email clients both handle. */
export const NEWS_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type NewsImageType = keyof typeof NEWS_IMAGE_TYPES;

export const NEWS_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Wider images are scaled down (emails show them at 536px; 1200 keeps them sharp on retina screens). */
export const NEWS_IMAGE_MAX_WIDTH = 1200;
export const NEWS_IMAGE_DIR = "platform/product-news";
export const NEWS_IMAGE_ACCEPT = Object.keys(NEWS_IMAGE_TYPES).join(",");

export function isNewsImageType(type: string): type is NewsImageType {
  return Object.hasOwn(NEWS_IMAGE_TYPES, type);
}

/**
 * Why this file can't be a product news image, or null. `head` is the file's first bytes (SNIFF_BYTES): the bytes
 * must really be the declared type, so an HTML page renamed to .png is refused.
 */
export function newsImageProblem(input: { type: string; size: number; head?: Uint8Array | null }): string | null {
  const type = String(input.type ?? "").toLowerCase().split(";")[0]!.trim();
  if (!isNewsImageType(type)) return "Use a JPG, PNG, WebP or GIF image.";
  if (!Number.isFinite(input.size) || input.size <= 0) return "That file is empty.";
  if (input.size > NEWS_IMAGE_MAX_BYTES) return `That image is ${(input.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
  if (input.head) return uploadContentProblem(type, input.head);
  return null;
}

/** platform/product-news/<uuid>.<ext>: the extension comes from the checked type, never the browser's file name. */
export function newsImagePath(type: NewsImageType, id: string) {
  const clean = String(id).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (clean.length < 16) throw new Error("newsImagePath needs a random id");
  return `${NEWS_IMAGE_DIR}/${clean}.${NEWS_IMAGE_TYPES[type]}`;
}

/** The size to scale to: never wider than NEWS_IMAGE_MAX_WIDTH, never enlarged. null = keep as is. */
export function newsImageResize(width: number | null | undefined, type: NewsImageType) {
  // Animated GIFs would lose frames or balloon in size; they're kept as uploaded (the 5 MB limit still applies).
  if (type === "image/gif" || !width || width <= NEWS_IMAGE_MAX_WIDTH) return null;
  return { width: NEWS_IMAGE_MAX_WIDTH };
}
