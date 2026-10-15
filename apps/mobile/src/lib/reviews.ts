import { api, apiBody } from "./api";
import type { RequestChannel } from "./review-ask";

export type { RequestChannel };

// Reviews (web /home/reviews): every review across the store's own form, Google and imported ones.
// List: GET /api/app/reviews; drafting: POST /api/app/reviews/draft-reply; replying and review links:
// /api/mobile/reviews/** (the web does those with server actions).

export interface ReviewItem {
  key: string;
  kind: "store" | "external";
  id: string;
  source: string;
  authorName: string;
  rating: number | null;
  title: string;
  body: string;
  images: string[];
  status: "approved" | "pending" | "rejected";
  featured: boolean;
  verifiedBuyer: boolean;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  rated: number;
  average: number;
  distribution: [number, number, number, number, number];
  responseRate: number;
  needsReply: number;
  pending: number;
}

export const SOURCE_LABELS: Record<string, string> = {
  store: "Your store",
  google: "Google",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  jumia: "Jumia",
  konga: "Konga",
  marketplace: "Marketplace",
  other: "Other",
};

/** The last list loaded, so a review opens instantly from it. */
const seen = new Map<string, ReviewItem>();

export async function fetchReviews(filters: { rating?: number | null; reply?: "needed" | null } = {}) {
  const params = new URLSearchParams({ limit: "100" });
  if (filters.rating) params.set("rating", String(filters.rating));
  if (filters.reply) params.set("reply", filters.reply);
  const body = await apiBody<{ data: ReviewItem[]; meta: { total: number; summary: ReviewSummary } }>(`/api/app/reviews?${params.toString()}`);
  for (const item of body.data) seen.set(item.key, item);
  return { items: body.data, total: body.meta.total, summary: body.meta.summary };
}

export async function fetchReview(key: string): Promise<ReviewItem | null> {
  const cached = seen.get(key);
  if (cached) return cached;
  await fetchReviews();
  return seen.get(key) ?? null;
}

export function rememberReview(item: ReviewItem) {
  seen.set(item.key, item);
}

export const draftReviewReply = (key: string) => api<{ reply: string }>("/api/app/reviews/draft-reply", { method: "POST", json: { key } });

export const saveReviewReply = (key: string, reply: string) =>
  api<{ message: string; google: "synced" | "failed" | null }>("/api/mobile/reviews/reply", { method: "POST", json: { key, reply } });

export interface ReviewableOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  hasPhone: boolean;
  status: string;
  at: string;
}

export const fetchReviewRequests = () => api<{ wall: string; orders: ReviewableOrder[] }>("/api/mobile/reviews/link");

export const makeReviewLink = (orderId: string) => api<{ link: string; message: string; whatsappUrl: string | null }>("/api/mobile/reviews/link", { method: "POST", json: { orderId } });

export function stars(rating: number | null) {
  if (!rating) return "";
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

/** Publish / Move to waiting / Hide, or Feature / Stop featuring (featuring also publishes). Returns the review. */
export async function moderateReview(key: string, change: { status: ReviewItem["status"] } | { featured: boolean }) {
  const item = await api<ReviewItem>(`/api/app/reviews/${encodeURIComponent(key)}`, { method: "PATCH", json: change });
  seen.set(item.key, item);
  return item;
}

// Ask for reviews now (web /home/reviews/request): /api/app/reviews/requests.

export const REQUEST_CHANNELS: RequestChannel[] = ["email", "sms", "whatsapp", "link"];

export interface AskableOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  at: string;
  reach: Record<RequestChannel, boolean>;
  asked: { channel: string; at: string } | null;
  reviewed: boolean;
}

export interface AskData {
  wall: string;
  ready: Record<RequestChannel, boolean> & { links: boolean };
  orders: AskableOrder[];
}

export interface AskOutcome {
  orderId: string;
  orderNumber: string;
  customerName: string;
  status: "sent" | "failed" | "skipped" | "link";
  reason?: string;
  whatsappUrl?: string;
}

export const fetchAskData = () => api<AskData>("/api/app/reviews/requests");

export const askForReviews = (orderIds: string[], channel: RequestChannel, resend: boolean) =>
  api<{ sent: number; failed: number; skipped: number; results: AskOutcome[] }>("/api/app/reviews/requests", { method: "POST", json: { orderIds, channel, resend } });
