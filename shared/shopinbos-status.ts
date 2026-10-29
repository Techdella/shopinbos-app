// Shopinbos's own Status posts: a few getting-started posts per role, first in every new user's Status row and
// in the "Getting started" card on Home (and in Help, to watch again). Defined here in code, not stored as user
// posts; the words are in shared/i18n/messages/m_familiar ("sib.<role>.<key>.*"), the videos are the existing
// 60-second feature intros (shared/feature-intros.ts) and, when one is published, the help video for the topic
// (shared/help-videos.ts). The "video status" posts (keys vid…) play a short clip made for them, served from
// public/status-videos/ on app.shopinbos.com (scripts/make-status-videos.py), so people see they can post videos. Seen and dismissed are kept in User.preferences (shared/preferences.ts).
// Pure and import-free (type-only imports): the server builds the posts in src/lib/status/shopinbos.server.ts.
// Unit-tested in tests/shopinbos-status.test.mjs.

import type { StatusRole, StatusTone } from "./status.ts";

/** The built-in author's id in the feed (never a real user id: those are cuids or uuids). */
export const SHOPINBOS_AUTHOR_ID = "shopinbos";
export const SHOPINBOS_NAME = "Shopinbos";

/** A Shopinbos post's button: open a screen of the app, share the seller's shop link, or start a free call with Peggy. */
export type ShopinbosCta = { kind: "open"; path: string } | { kind: "share" } | { kind: "call_peggy" };

export interface ShopinbosPostDef {
  /** Stable key, part of the post id (`sib-<role>-<key>`) and of its message keys. */
  key: string;
  tone: StatusTone;
  /** A video post: the feature intro (shared/feature-intros.ts key) played in the app. */
  intro?: string;
  /** …and the help topic (shared/help-videos.ts) whose recorded video plays instead when one is published. */
  helpTopic?: string;
  /** A short clip in public/status-videos/ (<file>.mp4 and its poster <file>.jpg) that plays in the Status viewer. */
  clip?: { file: string; durationSeconds: number };
  cta?: ShopinbosCta;
}

const ROLE_SLUG: Record<StatusRole, string> = { seller: "seller", supplier: "supplier", logistics_partner: "partner" };

/** Where the clips are served from (the app's own static files). */
export const STATUS_CLIP_DIR = "/status-videos";
/** "Post a video status": opens the composer with Video chosen. */
export const VIDEO_STATUS_PATH = "/status/new?kind=video";

export const SHOPINBOS_POSTS: Record<StatusRole, readonly ShopinbosPostDef[]> = {
  seller: [
    { key: "welcome", tone: "peach", intro: "home", helpTopic: "start_shop" },
    { key: "vidproduct", tone: "ink", clip: { file: "seller-product", durationSeconds: 10 }, cta: { kind: "open", path: VIDEO_STATUS_PATH } },
    { key: "call", tone: "mint", cta: { kind: "call_peggy" } },
    { key: "product", tone: "mint", intro: "inventory", helpTopic: "add_product", cta: { kind: "open", path: "/add-products" } },
    { key: "share", tone: "blue", cta: { kind: "share" } },
    { key: "status", tone: "warn", cta: { kind: "open", path: "/status/new" } },
    { key: "vidcustomer", tone: "ink", clip: { file: "seller-customer", durationSeconds: 10 }, cta: { kind: "open", path: VIDEO_STATUS_PATH } },
    { key: "find", tone: "ink", intro: "marketplace", helpTopic: "sell_without_stock", cta: { kind: "open", path: "/find" } },
  ],
  supplier: [
    { key: "welcome", tone: "peach", intro: "supplier-home", helpTopic: "supplier_orders" },
    { key: "vidstock", tone: "ink", clip: { file: "supplier-stock", durationSeconds: 10 }, cta: { kind: "open", path: VIDEO_STATUS_PATH } },
    { key: "call", tone: "mint", cta: { kind: "call_peggy" } },
    { key: "product", tone: "mint", intro: "supplier-products", helpTopic: "supplier_products", cta: { kind: "open", path: "/supplier/product/new" } },
    { key: "orders", tone: "blue", intro: "supplier-orders", cta: { kind: "open", path: "/supplier/orders" } },
    { key: "delivery", tone: "ink", cta: { kind: "open", path: "/delivery" } },
    { key: "vidpacking", tone: "ink", clip: { file: "supplier-packing", durationSeconds: 10 }, cta: { kind: "open", path: VIDEO_STATUS_PATH } },
    { key: "status", tone: "warn", cta: { kind: "open", path: "/status/new" } },
  ],
  logistics_partner: [
    { key: "welcome", tone: "peach", intro: "partner-home", helpTopic: "partner_jobs" },
    { key: "vidready", tone: "ink", clip: { file: "partner-ready", durationSeconds: 10 }, cta: { kind: "open", path: VIDEO_STATUS_PATH } },
    { key: "call", tone: "mint", cta: { kind: "call_peggy" } },
    { key: "jobs", tone: "mint", intro: "partner-jobs", cta: { kind: "open", path: "/logistics/jobs" } },
    { key: "riders", tone: "blue", intro: "partner-riders", helpTopic: "rider_flow", cta: { kind: "open", path: "/logistics/team" } },
    { key: "rates", tone: "ink", intro: "partner-rate-card", cta: { kind: "open", path: "/logistics/rates" } },
    { key: "viddone", tone: "ink", clip: { file: "partner-delivered", durationSeconds: 10 }, cta: { kind: "open", path: VIDEO_STATUS_PATH } },
    { key: "status", tone: "warn", cta: { kind: "open", path: "/status/new" } },
  ],
};

export function shopinbosPosts(role: unknown): readonly ShopinbosPostDef[] {
  return typeof role === "string" && role in SHOPINBOS_POSTS ? SHOPINBOS_POSTS[role as StatusRole] : [];
}

/** "sib-seller-welcome": the post's id in the feed (and in the seen list). */
export function shopinbosPostId(role: StatusRole, key: string) {
  return `sib-${ROLE_SLUG[role]}-${key}`;
}

const POST_ID = /^sib-(seller|supplier|partner)-([a-z]{1,20})$/;

/** Whether an id is one of Shopinbos's posts (for any role); its role and key, or null. */
export function parseShopinbosPostId(id: unknown): { role: StatusRole; key: string } | null {
  const match = typeof id === "string" ? POST_ID.exec(id) : null;
  if (!match) return null;
  const role = (Object.keys(ROLE_SLUG) as StatusRole[]).find((value) => ROLE_SLUG[value] === match[1])!;
  return SHOPINBOS_POSTS[role].some((post) => post.key === match[2]) ? { role, key: match[2]! } : null;
}

/** A clip's video and poster paths on the app's own site ("/status-videos/seller-product.mp4"); null without one. */
export function clipPaths(def: Pick<ShopinbosPostDef, "clip">): { video: string; poster: string; durationSeconds: number } | null {
  if (!def.clip || !/^[a-z0-9-]{1,40}$/.test(def.clip.file)) return null;
  return { video: `${STATUS_CLIP_DIR}/${def.clip.file}.mp4`, poster: `${STATUS_CLIP_DIR}/${def.clip.file}.jpg`, durationSeconds: def.clip.durationSeconds };
}

/** The m_familiar message keys for a post's words. */
export function shopinbosMessageKeys(role: StatusRole, key: string) {
  const base = `sib.${ROLE_SLUG[role]}.${key}`;
  return { title: `${base}.title`, body: `${base}.body`, cta: `${base}.cta` };
}

/** App paths a Shopinbos button may open (the phone refuses anything else). */
export function isShopinbosPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  return Object.values(SHOPINBOS_POSTS).some((posts) => posts.some((post) => post.cta?.kind === "open" && post.cta.path === path));
}

/** Seen post ids kept per person (oldest dropped first). */
export const MAX_SHOPINBOS_SEEN = 40;

/** A clean seen list: known Shopinbos post ids only, each once, at most MAX_SHOPINBOS_SEEN. */
export function parseShopinbosSeen(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((id): id is string => parseShopinbosPostId(id) !== null);
  return ids.filter((id, index) => ids.lastIndexOf(id) === index).slice(-MAX_SHOPINBOS_SEEN);
}

/** What can be dismissed for good: Shopinbos's statuses in the Status row, or the Getting started card on Home. */
export const SHOPINBOS_DISMISS = ["status", "start"] as const;
export type ShopinbosDismiss = (typeof SHOPINBOS_DISMISS)[number];
