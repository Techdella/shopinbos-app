// One-minute help videos (build spec 8A: "Every screen has a Help button: … or watch a one-minute video").
// The topic list, which screens each topic belongs to, picking the right language, and checking video links.
// Pure and import-free: used by the API, the admin page, Help on web and mobile, and tests/voice-and-videos.test.mjs.

export type HelpVideoRole = "seller" | "supplier" | "logistics_partner" | "rider";
export const HELP_VIDEO_ROLES: { value: HelpVideoRole; label: string }[] = [
  { value: "seller", label: "Sellers" },
  { value: "supplier", label: "Suppliers" },
  { value: "logistics_partner", label: "Delivery partners" },
  { value: "rider", label: "Riders" },
];

export const HELP_VIDEO_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pcm", label: "Pidgin" },
  { code: "yo", label: "Yorùbá" },
  { code: "ha", label: "Hausa" },
  { code: "ig", label: "Igbo" },
] as const;
export type HelpVideoLanguage = (typeof HELP_VIDEO_LANGUAGES)[number]["code"];
export const FALLBACK_LANGUAGE: HelpVideoLanguage = "en";

export interface HelpTopic {
  key: string;
  /** Title of the draft video the seed creates. */
  title: string;
  roles: HelpVideoRole[];
  /** Screens (web and mobile paths) this topic explains. The longest matching prefix wins. */
  paths: string[];
}

export const HELP_TOPICS: HelpTopic[] = [
  { key: "start_shop", title: "Set up your shop in a minute", roles: ["seller"], paths: ["/home/start", "/onboarding", "/builder", "/home/store", "/shop"] },
  { key: "add_product", title: "Add a product", roles: ["seller"], paths: ["/products", "/add-products", "/home/imports", "/home/inventory", "/home/collections", "/home/categories", "/seller/products", "/onboarding/products"] },
  { key: "record_sale", title: "Record a sale", roles: ["seller"], paths: ["/record-sale", "/home/orders/new"] },
  { key: "orders", title: "Send an order to your customer", roles: ["seller"], paths: ["/home/orders", "/orders", "/order", "/seller/orders"] },
  { key: "get_paid", title: "How you get paid", roles: ["seller", "supplier", "logistics_partner"], paths: ["/home/payments", "/home/payouts", "/onboarding/payments", "/seller/payments", "/seller/payouts", "/supplier/payouts", "/supplier/money", "/logistics/payouts", "/logistics/cash", "/logistics/earnings", "/logistics/billing"] },
  { key: "web_address", title: "Your shop's web address", roles: ["seller"], paths: ["/home/domain"] },
  { key: "delivery", title: "Get orders delivered", roles: ["seller"], paths: ["/home/shipping", "/home/logistics", "/marketplace/logistics", "/partners", "/seller/logistics"] },
  { key: "whatsapp", title: "Sell on WhatsApp", roles: ["seller"], paths: ["/home/social/whatsapp", "/home/inbox", "/home/marketing/whatsapp", "/channels", "/chats", "/inbox"] },
  { key: "get_customers", title: "Get more customers with an advert", roles: ["seller"], paths: ["/home/ads", "/home/marketing", "/marketing", "/home/social", "/home/video"] },
  { key: "sell_without_stock", title: "Sell without stock", roles: ["seller"], paths: ["/marketplace", "/home/dropship", "/dropship", "/find"] },
  { key: "supplier_products", title: "Add your products for shops to sell", roles: ["supplier"], paths: ["/supplier/products", "/supplier/product"] },
  { key: "supplier_orders", title: "Handle orders from shops", roles: ["supplier"], paths: ["/supplier/orders", "/supplier/order", "/supplier/quote-requests", "/supplier/quotes", "/supplier/quote", "/supplier/wholesale", "/supplier/home", "/supplier/dashboard"] },
  { key: "partner_jobs", title: "Take delivery jobs", roles: ["logistics_partner"], paths: ["/logistics/bookings", "/logistics/quotes", "/logistics/jobs", "/logistics/job", "/logistics/home", "/logistics/dashboard"] },
  { key: "rider_flow", title: "Pick up and drop off as a rider", roles: ["logistics_partner", "rider"], paths: ["/rider", "/logistics/riders", "/logistics/add-rider", "/logistics/couriers"] },
];

const TOPIC_KEYS = new Set(HELP_TOPICS.map((topic) => topic.key));
export function isHelpTopic(value: unknown): value is string {
  return typeof value === "string" && TOPIC_KEYS.has(value);
}

export function topicTitle(key: string) {
  return HELP_TOPICS.find((topic) => topic.key === key)?.title ?? key;
}

/** Strips query, hash, trailing slash and Expo Router groups ("/supplier/(tabs)/orders" → "/supplier/orders"). */
export function normaliseHelpPath(path: string | null | undefined) {
  const clean = (path ?? "").split(/[?#]/)[0]!.replace(/\/\([^/]+\)/g, "").replace(/\/+$/, "");
  return clean.startsWith("/") ? clean : `/${clean}`;
}

/** The help topic for the screen at `path` (web or mobile), or null when no video explains it. */
export function topicForPath(path: string | null | undefined, role?: HelpVideoRole | null): string | null {
  const clean = normaliseHelpPath(path);
  let best: { key: string; length: number } | null = null;
  for (const topic of HELP_TOPICS) {
    if (role && !topic.roles.includes(role)) continue;
    for (const prefix of topic.paths) {
      const match = clean === prefix || clean.startsWith(`${prefix}/`);
      if (match && (!best || prefix.length > best.length)) best = { key: topic.key, length: prefix.length };
    }
  }
  return best?.key ?? null;
}

/** The app language from a locale ("yo-NG" → "yo"); English for anything we don't have. */
export function helpLanguage(locale: string | null | undefined): HelpVideoLanguage {
  const raw = (locale ?? "").toLowerCase().trim();
  const named: Record<string, HelpVideoLanguage> = { english: "en", pidgin: "pcm", yoruba: "yo", hausa: "ha", igbo: "ig" };
  if (named[raw]) return named[raw]!;
  const base = raw.split(/[-_]/)[0]!;
  return (HELP_VIDEO_LANGUAGES.some((lang) => lang.code === base) ? base : FALLBACK_LANGUAGE) as HelpVideoLanguage;
}

export interface HelpVideoLike {
  topic: string;
  language: string;
  roles: string[];
  published?: boolean;
  videoUrl?: string | null;
}

function playable(video: HelpVideoLike) {
  return video.published !== false && Boolean(video.videoUrl);
}

/** The video for a topic in the person's language, else English, else nothing (the option is then hidden). */
export function pickHelpVideo<T extends HelpVideoLike>(videos: T[], topic: string | null, language: string, role?: HelpVideoRole | null): T | null {
  if (!topic) return null;
  const candidates = videos.filter((video) => video.topic === topic && playable(video) && (!role || video.roles.includes(role)));
  return candidates.find((video) => video.language === language) ?? candidates.find((video) => video.language === FALLBACK_LANGUAGE) ?? null;
}

/** "All videos" for a role: one per topic, in the person's language where there is one, in topic order. */
export function helpVideosForRole<T extends HelpVideoLike>(videos: T[], role: HelpVideoRole | null, language: string): T[] {
  const out: T[] = [];
  for (const topic of HELP_TOPICS) {
    const video = pickHelpVideo(videos, topic.key, language, role);
    if (video) out.push(video);
  }
  // Topics added in the database but not in HELP_TOPICS still show, after the known ones.
  const known = new Set(HELP_TOPICS.map((topic) => topic.key));
  for (const topic of [...new Set(videos.map((video) => video.topic))].filter((key) => !known.has(key))) {
    const video = pickHelpVideo(videos, topic, language, role);
    if (video) out.push(video);
  }
  return out;
}

// ─── Video links ─────────────────────────────────────────────────────────────

export type VideoSource =
  | { kind: "youtube"; id: string; embedUrl: string; watchUrl: string }
  | { kind: "vimeo"; id: string; hash: string | null; embedUrl: string; watchUrl: string }
  | { kind: "file"; url: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A pasted YouTube or Vimeo link as an embeddable source, or null for anything else (other hosts, http,
 * playlists, channels). Only these two hosts are allowed for pasted links.
 */
export function parseVideoLink(input: string | null | undefined): Extract<VideoSource, { kind: "youtube" | "vimeo" }> | null {
  let url: URL;
  try {
    url = new URL((input ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    let id: string | null = null;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return { kind: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`, watchUrl: `https://www.youtube.com/watch?v=${id}` };
  }

  if (VIMEO_HOSTS.has(host)) {
    const ids = host === "player.vimeo.com" ? (parts[0] === "video" ? parts.slice(1) : []) : parts;
    const id = ids[0];
    if (!id || !/^\d{3,12}$/.test(id)) return null;
    const hash = url.searchParams.get("h") ?? (ids[1] && /^[0-9a-f]{6,20}$/i.test(ids[1]) ? ids[1] : null);
    const h = hash ? `&h=${hash}` : "";
    return { kind: "vimeo", id, hash, embedUrl: `https://player.vimeo.com/video/${id}?dnt=1${h}`, watchUrl: `https://vimeo.com/${id}${hash ? `/${hash}` : ""}` };
  }
  return null;
}

/** Where help-video uploads live in the public media bucket. */
export const HELP_VIDEO_FOLDER = "platform/help-videos";
export const HELP_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const HELP_POSTER_MAX_BYTES = 2 * 1024 * 1024;
export const HELP_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const HELP_POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Why this file can't be a help video (or poster), or null. */
export function helpUploadProblem(kind: "video" | "poster", type: string, size: number): string | null {
  const base = type.toLowerCase().split(";")[0]!.trim();
  if (kind === "video") {
    if (!(HELP_VIDEO_TYPES as readonly string[]).includes(base)) return "Upload an MP4 or WebM video.";
    if (size > HELP_VIDEO_MAX_BYTES) return "That video is over 50 MB. Export it smaller, or paste a YouTube or Vimeo link.";
  } else {
    if (!(HELP_POSTER_TYPES as readonly string[]).includes(base)) return "Use a JPG, PNG or WebP picture for the poster.";
    if (size > HELP_POSTER_MAX_BYTES) return "That picture is over 2 MB. Use a smaller one.";
  }
  if (size <= 0) return "That file is empty.";
  return null;
}

/**
 * How to play a stored video URL: a YouTube/Vimeo embed, or a file in our own media bucket. Anything else is
 * refused (null), so the Help player never loads a page from an unknown site. `storageBase` is
 * `${SUPABASE_URL}/storage/v1/object/public/<bucket>/`.
 */
export function videoSource(url: string | null | undefined, storageBase: string | null | undefined): VideoSource | null {
  if (!url) return null;
  const link = parseVideoLink(url);
  if (link) return link;
  const base = (storageBase ?? "").replace(/\/?$/, "/");
  if (base.length > 1 && url.startsWith(`${base}${HELP_VIDEO_FOLDER}/`) && !url.includes("..")) return { kind: "file", url };
  return null;
}

/** "1 min" / "45 sec" for a card. */
export function durationLabel(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "1 min";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
