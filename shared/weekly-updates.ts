// Weekly updates: short status-style posts from the Shopinbos team (selling tips, news) that sellers, suppliers
// and delivery partners tap through from the ring in the top bar. Admins make them at /admin/updates.
// Pure and import-free: used by the API, the admin page, the viewer and tests/weekly-updates.test.mjs.

export type UpdateRole = "seller" | "supplier" | "logistics_partner";
export const UPDATE_ROLES: { value: UpdateRole; label: string }[] = [
  { value: "seller", label: "Sellers" },
  { value: "supplier", label: "Suppliers" },
  { value: "logistics_partner", label: "Delivery partners" },
];

export function isUpdateRole(value: unknown): value is UpdateRole {
  return typeof value === "string" && UPDATE_ROLES.some((role) => role.value === value);
}

/**
 * text: words on a colour card. motion: the words animate in, line by line (kinetic type, made in the browser).
 * image: a picture with an optional caption. video: an uploaded clip or a YouTube/Vimeo link.
 */
export const UPDATE_KINDS = [
  { value: "text", label: "Text" },
  { value: "motion", label: "Motion" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
] as const;
export type UpdateKind = (typeof UPDATE_KINDS)[number]["value"];

export function isUpdateKind(value: unknown): value is UpdateKind {
  return typeof value === "string" && UPDATE_KINDS.some((kind) => kind.value === value);
}

/** Card backgrounds for text and motion updates (the brand palette). */
export const UPDATE_THEMES = [
  { value: "navy", label: "Navy", bg: "#0E2A38", ink: "#F4F1EA", accent: "#73D8C8" },
  { value: "mint", label: "Mint", bg: "#73D8C8", ink: "#0E2A38", accent: "#0E2A38" },
  { value: "teal", label: "Teal", bg: "#2E7E78", ink: "#F4F1EA", accent: "#F2A93B" },
  { value: "amber", label: "Amber", bg: "#F2A93B", ink: "#0E2A38", accent: "#0E2A38" },
  { value: "coral", label: "Coral", bg: "#E86A4F", ink: "#FAF7F1", accent: "#0E2A38" },
  { value: "plum", label: "Plum", bg: "#6B4F8A", ink: "#F4F1EA", accent: "#73D8C8" },
  { value: "cream", label: "Cream", bg: "#F4F1EA", ink: "#0E2A38", accent: "#2E7E78" },
] as const;
export type UpdateTheme = (typeof UPDATE_THEMES)[number]["value"];

export function updateTheme(value: string | null | undefined) {
  return UPDATE_THEMES.find((theme) => theme.value === value) ?? UPDATE_THEMES[0];
}

/** How motion updates move: words rise in, slide in from the side, or pop in one by one. */
export const MOTION_STYLES = [
  { value: "rise", label: "Rise" },
  { value: "slide", label: "Slide" },
  { value: "pop", label: "Pop" },
] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number]["value"];

export function motionStyle(value: string | null | undefined): MotionStyle {
  return MOTION_STYLES.some((style) => style.value === value) ? (value as MotionStyle) : "rise";
}

export const UPDATE_TITLE_MAX = 90;
export const UPDATE_BODY_MAX = 600;

/** How long the viewer shows a card before moving on (videos play to the end). */
export function slideDurationMs(update: { kind: string; body?: string | null; durationSeconds?: number | null }) {
  if (update.kind === "video") return Math.max(3, Math.min(180, update.durationSeconds ?? 30)) * 1000;
  const words = (update.body ?? "").trim().split(/\s+/).filter(Boolean).length;
  // About 3.5 words a second to read, at least 6 seconds, at most 20; motion adds time for the lines to come in.
  const reading = Math.min(20_000, Math.max(6_000, Math.round((words / 3.5) * 1000) + 2_500));
  return update.kind === "motion" ? Math.min(24_000, reading + 1_500) : reading;
}

/** The lines a motion update animates in: one per line the admin wrote, long lines split near 6 words. */
export function motionLines(body: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of (body ?? "").split(/\n+/)) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 6) out.push(words.slice(i, i + 6).join(" "));
  }
  return out.slice(0, 16);
}

export interface UpdateWindow {
  published: boolean;
  publishAt: Date | string | null;
  expiresAt: Date | string | null;
}

const time = (value: Date | string | null) => (value === null ? null : new Date(value).getTime());

/** draft | scheduled | live | ended, for the admin list and the API. */
export function updateStatus(update: UpdateWindow, now = new Date()): "draft" | "scheduled" | "live" | "ended" {
  if (!update.published) return "draft";
  const start = time(update.publishAt);
  const end = time(update.expiresAt);
  if (start !== null && start > now.getTime()) return "scheduled";
  if (end !== null && end <= now.getTime()) return "ended";
  return "live";
}

/** Monday 08:00 Lagos time (07:00 UTC) of the week after `from`, as the default go-live time for a new update. */
export function nextMondayMorning(from = new Date()): Date {
  const date = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 7, 0, 0));
  const day = date.getUTCDay();
  const ahead = ((8 - day) % 7) || 7;
  date.setUTCDate(date.getUTCDate() + ahead);
  return date;
}

export const EXPIRY_CHOICES = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 0, label: "Until I take it down" },
] as const;

/** Only links inside the app ("/home/ads") or https links; anything else is dropped. */
export function safeCtaUrl(value: string | null | undefined): string | null {
  const url = (value ?? "").trim();
  if (!url) return null;
  if (/^\/(?!\/)[\w\-./?=&%#~+]*$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Where update uploads live in the public media bucket. */
export const UPDATE_FOLDER = "platform/updates";
export const UPDATE_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const UPDATE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const UPDATE_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const UPDATE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Why this file can't go on an update (an image or poster, or a video), or null. */
export function updateUploadProblem(kind: "video" | "image", type: string, size: number): string | null {
  const base = type.toLowerCase().split(";")[0]!.trim();
  if (kind === "video") {
    if (!(UPDATE_VIDEO_TYPES as readonly string[]).includes(base)) return "Upload an MP4 or WebM video.";
    if (size > UPDATE_VIDEO_MAX_BYTES) return "That video is over 50 MB. Export it smaller, or paste a YouTube or Vimeo link.";
  } else {
    if (!(UPDATE_IMAGE_TYPES as readonly string[]).includes(base)) return "Use a JPG, PNG, WebP or GIF picture.";
    if (size > UPDATE_IMAGE_MAX_BYTES) return "That picture is over 5 MB. Use a smaller one.";
  }
  if (size <= 0) return "That file is empty.";
  return null;
}

/** A file we stored for updates (never a URL from anywhere else). */
export function isOwnUpdateFile(url: string | null | undefined, storageBase: string | null | undefined): boolean {
  const base = (storageBase ?? "").replace(/\/?$/, "/");
  return Boolean(url && base.length > 1 && url.startsWith(`${base}${UPDATE_FOLDER}/`) && !url.includes(".."));
}
