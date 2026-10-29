import { api, ApiError } from "./api";
import { appLocale } from "./app-locale";
import { uploadOnePhoto, type PhotoInput } from "./upload-photo";

// API clients for the "Familiar app" features shared by sellers, suppliers and delivery partners: Status (24-hour
// stories), Rewards, credits, Ask Peggy for every role, Create with Rex and the posts calendar. Shapes follow the
// server routes under src/app/api/mobile/{status,rewards,credits,peggy,create,posts}. A route that isn't there yet
// (an older server) answers 404: `optional` turns that into null so the screen hides that part instead of failing.

export async function optional<T>(load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 501)) return null;
    throw error;
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────

export type StatusRole = "seller" | "supplier" | "logistics_partner";
export type StatusTone = "peach" | "mint" | "blue" | "warn" | "ink";
export type StatusCtaKind = "add_product" | "chat" | "connect" | "see_rates" | "offer_delivery" | "view_shop";

export interface StatusPost {
  id: string;
  headline: string;
  caption: string | null;
  imageUrl: string | null;
  tone: StatusTone;
  product: { id: string; name: string; price: number; image: string | null } | null;
  /** "open" (an app screen, target.path) and "share" (my shop link) come only on Shopinbos's own posts. */
  cta: { kind: StatusCtaKind | ShopinbosCtaKind; label: string; target?: { userId: string; slug?: string | null; partnerId?: string | null; productId?: string | null; path?: string | null } } | null;
  /** Shopinbos's video posts: play `url` here, else the 60-second intro `intro`, else open `watchUrl`. */
  video?: StatusVideo | null;
  /** Shopinbos's posts: seen (or watched) by me. */
  seen?: boolean;
  createdAt: string;
  expiresAt: string;
  views: number;
  likes: number;
  liked: boolean;
}

export type ShopinbosCtaKind = "open" | "share" | "call_peggy";

export interface StatusVideo {
  intro: string | null;
  url: string | null;
  watchUrl: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
}

export interface StatusAuthor {
  userId: string;
  name: string;
  role: StatusRole;
  logoUrl: string | null;
  seen: boolean;
  posts: StatusPost[];
  /** Shopinbos's own getting-started posts (shared/shopinbos-status.ts): the brand logo, no likes. */
  official?: boolean;
  /** "Shopinbos" in the person's language, shown instead of the role. */
  roleLabel?: string;
}

export interface StatusFeed {
  mine: { posts: StatusPost[]; viewsLast: number };
  feed: StatusAuthor[];
}

export const fetchStatusFeed = () => optional(api<StatusFeed>(`/api/mobile/status?lang=${appLocale()}`));

/** Shopinbos's getting-started posts for my role (also after "Don't show again", for Home and Help). */
export interface ShopinbosState {
  author: StatusAuthor | null;
  statusOff: boolean;
  startOff: boolean;
}
export const fetchShopinbos = () => optional(api<ShopinbosState>(`/api/mobile/status/shopinbos?lang=${appLocale()}`));

/** "Don't show again" on Shopinbos's statuses ("status"), or the X on the Getting started card ("start"). For good. */
export const dismissShopinbos = (what: "status" | "start") =>
  api<{ statusOff: boolean; startOff: boolean }>("/api/mobile/status/shopinbos/dismiss", { method: "POST", json: { what } });

export const postStatus = (input: { headline: string; caption?: string; imageUrl?: string; tone?: StatusTone; productId?: string; ctaKind?: StatusCtaKind }) =>
  api<{ post: StatusPost; reward: { points: number; streak: number } | null }>("/api/mobile/status", { method: "POST", json: input });

export function uploadStatusImage(photo: PhotoInput) {
  return uploadOnePhoto<{ url: string }>("/api/mobile/status/upload", photo, {}, { base: "status" });
}

export const markStatusSeen = (id: string) => api<{ ok: true }>(`/api/mobile/status/${encodeURIComponent(id)}/view`, { method: "POST" }).catch(() => null);
export const likeStatus = (id: string, like: boolean) => api<{ likes: number; liked: boolean }>(`/api/mobile/status/${encodeURIComponent(id)}/like`, { method: "POST", json: { like } });
export const deleteStatus = (id: string) => api<{ ok: true }>(`/api/mobile/status/${encodeURIComponent(id)}`, { method: "DELETE" });

// ─── Rewards ─────────────────────────────────────────────────────────────────

export interface Rewards {
  level: number;
  levelName: string;
  nextLevelName: string | null;
  xp: number;
  xpForNext: number | null;
  points: number;
  streak: number;
  challenges: Array<{ key: string; title: string; progress: number; target: number; points: number; claimable: boolean; claimed: boolean }>;
  resetsAt: string;
  badges: Array<{ key: string; title: string; earned: boolean; earnedAt: string | null }>;
  swap: { points: number; credits: number; canSwap: boolean };
  /** Loyalty tier (shared/loyalty.ts); missing from older servers. */
  loyalty?: { tier: string; tierName: string; color: string; monthlyCredits: number; perks: string[]; next: { tierName: string; atLevel: number; monthlyCredits: number } | null; founding: boolean };
}

export const fetchRewards = () => optional(api<Rewards>("/api/mobile/rewards"));
export const claimChallenge = (key: string) => api<Rewards>("/api/mobile/rewards/claim", { method: "POST", json: { key } });
export const swapPoints = () => api<{ rewards: Rewards; creditsAdded: number }>("/api/mobile/rewards/swap", { method: "POST" });

/** 0–1 of the way to the next level (a full ring at the top level). */
export const levelProgress = (rewards: Pick<Rewards, "xp" | "xpForNext"> | null | undefined) =>
  !rewards ? 0 : rewards.xpForNext ? Math.max(0, Math.min(1, rewards.xp / rewards.xpForNext)) : 1;

// ─── Credits (shown, never sold in the app) ──────────────────────────────────

export const fetchCredits = () => optional(api<{ balance: number; note: string | null }>("/api/mobile/credits"));
// Credits are never sold in the app, and nothing emails or links to the website to buy them: AI credits are digital
// goods (Google Play Payments; Apple 3.1.1 and 3.1.3). docs/store-payments-audit.md.

// ─── Ask Peggy (every role) ──────────────────────────────────────────────────

export type ChatTurn = { role: "user" | "assistant"; content: string };
export const fetchPeggyIntro = () => optional(api<{ suggestions: string[]; intro: string }>("/api/mobile/peggy"));
export const askPeggy = (messages: ChatTurn[]) => api<{ reply: string; creditsLeft: number | null }>("/api/mobile/peggy", { method: "POST", json: { messages } });

// ─── Create with Rex ─────────────────────────────────────────────────────────

export type CreateFormat = "status" | "reel" | "post" | "flyer";
export interface CreateIdea {
  id: string;
  title: string;
  line: string;
  format: CreateFormat;
}
export interface CreateJob {
  id: string;
  status: "making" | "done" | "failed";
  format: CreateFormat;
  designs: Array<{ id: string; imageUrl: string; caption: string }>;
  error: string | null;
}

export const fetchIdeas = () => optional(api<{ ideas: CreateIdea[] }>("/api/mobile/create/ideas"));
export const startCreate = (input: { format: CreateFormat; ideaId?: string; prompt?: string; productId?: string }) => api<{ job: CreateJob }>("/api/mobile/create", { method: "POST", json: input });
export const fetchCreateJob = (id: string) => api<{ job: CreateJob }>(`/api/mobile/create/${encodeURIComponent(id)}`);

// ─── Posts calendar ──────────────────────────────────────────────────────────

// A seller's calendar is their Social posts on the web (Facebook and Instagram post by themselves when the Page is
// connected; WhatsApp, TikTok and X get a reminder); suppliers and delivery partners get reminders only. Seller
// posts carry `kind: "social"` and each channel's result.

export type PostPlatform = "whatsapp" | "instagram" | "facebook" | "tiktok" | "x";
/** One channel of a seller's post. auto: posts by itself; state: pending (not its time), waiting (Instagram
 * processing), ready (your turn to post), shared (you did), posted (we did), failed. */
export interface PostChannelResult {
  key: PostPlatform;
  auto: boolean;
  state: "pending" | "waiting" | "ready" | "shared" | "posted" | "failed";
  url?: string;
  error?: string;
}
export interface ScheduledPost {
  id: string;
  imageUrl: string | null;
  caption: string;
  platforms: string[];
  /** attention: it didn't go out (a seller's post that failed everywhere). */
  status: "draft" | "scheduled" | "posted" | "attention";
  scheduledAt: string | null;
  postedAt: string | null;
  kind?: "social";
  channels?: PostChannelResult[];
  /** WhatsApp, TikTok or X is waiting for you to post it. */
  yourTurn?: boolean;
}
export interface PostAccount {
  key: PostPlatform;
  label: string;
  linked: boolean;
  /** Posts by itself (a seller's Facebook or Instagram connected on Social posts). */
  auto?: boolean;
}
export interface PostsWeek {
  posts: ScheduledPost[];
  accounts: PostAccount[];
}

export const fetchPosts = (from: Date, to: Date) => optional(api<PostsWeek>(`/api/mobile/posts?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`));
/** Just the accounts (for the Schedule sheet). */
export const fetchPostAccounts = () => optional(api<PostsWeek>("/api/mobile/posts?only=accounts")).then((week) => week?.accounts ?? null);
export const savePost = (input: { designId?: string; imageUrl?: string; caption: string; platforms: string[]; scheduledAt?: string | null }) => api<{ post: ScheduledPost }>("/api/mobile/posts", { method: "POST", json: input });
export const updatePost = (id: string, patch: Partial<Pick<ScheduledPost, "scheduledAt" | "caption" | "platforms">> & { status?: "posted"; channel?: PostPlatform }) =>
  api<{ post: ScheduledPost }>(`/api/mobile/posts/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });
export const deletePost = (id: string) => api<{ ok: true }>(`/api/mobile/posts/${encodeURIComponent(id)}`, { method: "DELETE" });

// ─── Supplier tracking ───────────────────────────────────────────────────────

export interface OrderTrack {
  status: string;
  title: string;
  from: string;
  to: string;
  partner: { name: string; phone: string | null } | null;
  eta: string | null;
  timeline: Array<{ label: string; at: string | null; state: "done" | "now" | "todo" }>;
  shareUrl: string | null;
}
export const fetchSupplierTrack = (id: string, kind: "dropship" | "wholesale") => optional(api<OrderTrack>(`/api/mobile/supplier/orders/${encodeURIComponent(id)}/track?kind=${kind}`));
