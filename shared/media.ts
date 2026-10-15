// Media library rules (pure, no imports): which files can be uploaded, how a library query is read, who may see or
// remove an asset, and which pasted links count as a picture. Used by /api/upload, /api/app/media, the web picker
// (src/components/media) and the phone app. Tests: tests/media-library.test.mjs.

export const MEDIA_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"] as const;
export const MEDIA_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"] as const;
export const MEDIA_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MEDIA_MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const MEDIA_PAGE_SIZE = 40;
export const MEDIA_MAX_PAGE_SIZE = 60;

export type MediaKind = "image" | "video";
/** Where a library entry came from. upload = added by the person; the rest are found in their store. */
export type MediaSource = "upload" | "product" | "ai" | "logo" | "banner" | "editor" | "collection" | "cms";

export interface MediaAssetView {
  id: string;
  url: string;
  kind: MediaKind;
  name: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  source: string;
  createdAt: string;
}

const IMAGE_SET = new Set<string>(MEDIA_IMAGE_TYPES);
const VIDEO_SET = new Set<string>(MEDIA_VIDEO_TYPES);

/** "image" | "video" for an allowed type, null otherwise. */
export function mediaKindOfType(type: string | null | undefined): MediaKind | null {
  const value = (type ?? "").toLowerCase().split(";")[0]!.trim();
  if (IMAGE_SET.has(value)) return "image";
  if (VIDEO_SET.has(value)) return "video";
  return null;
}

/**
 * Why a file can't go in the library (plain words), or null when it can. `allow` limits it to pictures only.
 * The bytes themselves (real type, SVG script) are checked again on the server by assertUploadContent.
 */
export function mediaFileProblem(file: { type?: string | null; size?: number | null }, allow: "image" | "any" = "any"): string | null {
  const kind = mediaKindOfType(file.type);
  if (!kind || (allow === "image" && kind !== "image")) {
    return allow === "image" ? "Choose a JPG, PNG, WebP, GIF or SVG picture." : "Only JPG, PNG, WebP, GIF, SVG, MP4, WebM, and Ogg files are allowed";
  }
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "That file is empty. Choose another one.";
  if (kind === "video" && size > MEDIA_MAX_VIDEO_BYTES) return "Video too large (max 80MB)";
  if (kind === "image" && size > MEDIA_MAX_IMAGE_BYTES) return "Image too large (max 10MB)";
  return null;
}

/** "image" | "video" from a link's file ending (library rows found in the store have no type). */
export function mediaKindOfUrl(url: string): MediaKind {
  return /\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(url) ? "video" : "image";
}

/** A link someone may paste instead of uploading: https only, no spaces, not absurdly long. */
export function isHttpsMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export interface MediaQuery {
  q: string;
  kind: MediaKind | null;
  page: number;
  limit: number;
}

/** Reads ?q=&kind=&page=&limit= safely (bad values fall back to defaults). */
export function parseMediaQuery(params: { get(name: string): string | null }): MediaQuery {
  const q = (params.get("q") ?? "").replace(/[\u0000-\u001f%_\\]/g, " ").trim().slice(0, 80);
  const kindRaw = params.get("kind");
  const kind: MediaKind | null = kindRaw === "image" || kindRaw === "video" ? kindRaw : null;
  const pageRaw = Number.parseInt(params.get("page") ?? "1", 10);
  const limitRaw = Number.parseInt(params.get("limit") ?? String(MEDIA_PAGE_SIZE), 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, 1000) : 1;
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, MEDIA_MAX_PAGE_SIZE) : MEDIA_PAGE_SIZE;
  return { q, kind, page, limit };
}

/** A library entry is only ever shown to, or removed by, the person it belongs to, and hidden ones stay hidden. */
export function canSeeMedia(asset: { userId: string; hiddenAt?: Date | string | null } | null | undefined, userId: string | null | undefined): boolean {
  return Boolean(asset && userId && asset.userId === userId && !asset.hiddenAt);
}

/** Width / height / size sent by the browser: whole positive numbers in a sane range, else null. */
export function cleanDimension(value: unknown, max = 20000): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** A short, safe display name from an uploaded file's name ("IMG_2041.JPG" → "IMG_2041"). */
export function mediaDisplayName(fileName: unknown): string | null {
  if (typeof fileName !== "string") return null;
  const base = fileName.split(/[\\/]/).pop()!.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[\u0000-\u001f<>]/g, "").trim();
  return base ? base.slice(0, 120) : null;
}

/**
 * The owner of an AI picture from its storage path: Rex and the studios save to generated/, enhanced/, logos/ or
 * banners/ followed by the user id. Null for any other path.
 */
export function aiImageOwner(path: string): string | null {
  const match = /^(?:generated|enhanced|logos|banners)\/([A-Za-z0-9_-]{6,64})\//.exec(path);
  return match ? match[1]! : null;
}

export type AiCreationKind = "logo" | "image" | "edit" | "banner";

/** What Rex made, from the picture's storage path (Rex's History > Creations). */
export function aiCreationKind(path: string | null | undefined): AiCreationKind {
  const folder = (path ?? "").split("/")[0];
  return folder === "logos" ? "logo" : folder === "banners" ? "banner" : folder === "enhanced" ? "edit" : "image";
}
