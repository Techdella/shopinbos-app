// Video statuses: the pure rules for a short video on a Status post (shared/status.ts has the rest). The phone picks
// or records a video of at most 30 seconds, asks POST /api/mobile/status/upload-url for a one-time signed upload URL
// and PUTs the file straight to Storage (Vercel functions refuse bodies over ~4.5 MB), with a poster frame next to
// it; POST /api/mobile/status then checks both URLs are this author's and the stored file is a video of the right
// size. The viewer's timing (how long each post shows, how full its progress bar is) is here too, so the phone and
// the tests agree. Import-free: the phone, the server and tests/status-video.test.mjs load it directly.

/** The longest video a status can carry (a little slack for a picker that rounds up). */
export const STATUS_VIDEO_MAX_MS = 30_000;
const DURATION_SLACK_MS = 1_000;
/** The largest video file after the phone's compression. */
export const STATUS_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
export const STATUS_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export type StatusVideoType = (typeof STATUS_VIDEO_TYPES)[number];
/** The poster frame: a small still. */
export const STATUS_POSTER_MAX_BYTES = 2 * 1024 * 1024;
export const STATUS_POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Video uploads (signed URLs) per user per day. */
export const STATUS_VIDEO_UPLOADS_PER_DAY = 20;

/** How long a photo or text post shows before moving on. */
export const STORY_SHOW_MS = 6000;

const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov" };
const POSTER_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** "video/mp4; codecs=…" → "video/mp4"; lower case. */
export function baseType(type: unknown) {
  return String(type ?? "").toLowerCase().split(";")[0]!.trim();
}

export const isStatusVideoType = (type: unknown): type is StatusVideoType => (STATUS_VIDEO_TYPES as readonly string[]).includes(baseType(type));
export const isStatusPosterType = (type: unknown) => (STATUS_POSTER_TYPES as readonly string[]).includes(baseType(type));

export type StatusVideoProblem = "type" | "empty" | "too_big" | "too_long";

/**
 * Why this video can't go on a status, or null. `durationMs` may be unknown (null): the stored file's size is still
 * checked, and the phone's picker already limits the length.
 */
export function statusVideoProblem(input: { type: unknown; size: number | null | undefined; durationMs?: number | null }): StatusVideoProblem | null {
  if (!isStatusVideoType(input.type)) return "type";
  const size = Number(input.size);
  if (input.size != null && (!Number.isFinite(size) || size <= 0)) return "empty";
  if (Number.isFinite(size) && size > STATUS_VIDEO_MAX_BYTES) return "too_big";
  if (input.durationMs != null && Number(input.durationMs) > STATUS_VIDEO_MAX_MS + DURATION_SLACK_MS) return "too_long";
  return null;
}

/** Why this poster can't be used, or null. */
export function statusPosterProblem(input: { type: unknown; size: number | null | undefined }): "type" | "empty" | "too_big" | null {
  if (!isStatusPosterType(input.type)) return "type";
  const size = Number(input.size);
  if (input.size != null && (!Number.isFinite(size) || size <= 0)) return "empty";
  if (Number.isFinite(size) && size > STATUS_POSTER_MAX_BYTES) return "too_big";
  return null;
}

/** The length to store: whole milliseconds within 1..30 000 (+ slack), or null when unknown or nonsense. */
export function cleanDurationMs(value: unknown): number | null {
  const ms = Math.round(Number(value));
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, STATUS_VIDEO_MAX_MS + DURATION_SLACK_MS);
}

/**
 * The picker's duration in milliseconds. expo-image-picker gives milliseconds; some Android builds give seconds,
 * so a small number (≤ 600) is read as seconds.
 */
export function pickerDurationMs(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n <= 600 ? n * 1000 : n);
}

/** Where a user's status files are stored in the public media bucket (photos, videos and posters). */
export function statusMediaDir(userId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new Error("Bad user id");
  return `status/${userId}`;
}

/** A fresh, unguessable path for an uploaded status video or poster; the extension comes from the checked type. */
export function statusVideoPath(userId: string, kind: "video" | "poster", type: string, id: string, now = Date.now()) {
  const ext = kind === "video" ? VIDEO_EXT[baseType(type)] : POSTER_EXT[baseType(type)];
  if (!ext) throw new Error(kind === "video" ? "Not a status video type" : "Not a status poster type");
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) throw new Error("Bad id");
  return `${statusMediaDir(userId)}/${now}-${id}${kind === "poster" ? "-poster" : ""}.${ext}`;
}

/**
 * A post's video (or poster) must be one this user uploaded with a signed URL from /api/mobile/status/upload-url: a
 * public URL in our bucket under status/<userId>/ (https, or http for a local Supabase on loopback), with a video
 * extension for "video" and an image extension for "poster".
 */
export function isStatusVideoUrl(url: unknown, options: { supabaseUrl: string | null | undefined; bucket: string; userId: string; kind?: "video" | "poster" }) {
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
    dir = statusMediaDir(options.userId);
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
  const ext = (options.kind ?? "video") === "video" ? /\.(mp4|mov)$/i : /-poster\.(jpe?g|png|webp)$/i;
  return path.startsWith(prefix) && !name.includes("/") && !path.includes("..") && ext.test(name);
}

// ─── Viewer timing ───────────────────────────────────────────────────────────

/**
 * How long the viewer shows a post: a photo or text post STORY_SHOW_MS; a video as long as the video really is
 * (the player's duration once it's known, else the length saved with the post), never more than 30 s plus slack,
 * and STORY_SHOW_MS when nothing is known yet.
 */
export function storyDurationMs(post: { video?: { url?: string | null; durationSeconds?: number | null } | null; durationMs?: number | null }, playerSeconds?: number | null): number {
  if (!post.video?.url) return STORY_SHOW_MS;
  const fromPlayer = Number(playerSeconds);
  if (Number.isFinite(fromPlayer) && fromPlayer > 0) return Math.round(fromPlayer * 1000);
  const saved = Number(post.durationMs ?? (post.video.durationSeconds != null ? post.video.durationSeconds * 1000 : NaN));
  if (Number.isFinite(saved) && saved > 0) return Math.round(saved);
  return STORY_SHOW_MS;
}

/** How full the current post's progress bar is (0..1). */
export function storyProgress(elapsedMs: number, totalMs: number) {
  if (!(totalMs > 0)) return 0;
  return Math.max(0, Math.min(1, elapsedMs / totalMs));
}

/** Whether a photo or text post's timer has run out (videos move on when they end). */
export function storyTimeUp(elapsedMs: number, totalMs: number) {
  return totalMs > 0 && elapsedMs >= totalMs;
}

/** An author's posts include a video that plays in the viewer: their ring and thumbnail get a ▶ badge. */
export function hasPlayableVideo(posts: ReadonlyArray<{ video?: { url?: string | null } | null }>) {
  return posts.some((post) => Boolean(post.video?.url));
}

/** "0:12" for a duration in milliseconds. */
export function clockLabel(ms: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
