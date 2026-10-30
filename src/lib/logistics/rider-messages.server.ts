import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { notify, notifyRider } from "@/lib/notifications/notify.server";
import { cleanRiderMessage, cleanRiderReview, ratingSummary, type RiderAudience, type RiderMessageView } from "@shared/rider-chat";
import { riderInboxSummary, riderThreadSummaries, type RiderChatSummary, type RiderInboxSummary } from "@shared/logistics-chats";

// Rider chat and rider reviews (shared/rider-chat.ts). Every thread is one rider and one other side:
//   company: the rider ↔ their delivery company (the partner's owner and staff reply from their app);
//   shop:    the rider ↔ the shop on one job they carry (the business that booked it; only while it's theirs).
// A review link is the job id with an HMAC, good for one rating per delivered job.

export type RiderSide = { kind: "rider"; riderId: string; partnerId: string } | { kind: "company"; userId: string; partnerId: string } | { kind: "shop"; userId: string };

const MAX_LIST = 100;

function view(row: { id: string; body: string; fromRider: boolean; createdAt: Date; readAt?: Date | null }, reader: RiderSide["kind"]): RiderMessageView {
  const mine = reader === "rider" ? row.fromRider : !row.fromRider;
  // `read`: the other side has opened the chat since (the ticks on your own messages).
  return { id: row.id, body: row.body, mine, createdAt: row.createdAt.toISOString(), read: mine ? Boolean(row.readAt) : true };
}

/** The job a shop thread is about, when this side may use it (the rider carries it / the shop booked it). */
async function jobFor(side: RiderSide, bookingId: string) {
  const job = await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { id: true, riderId: true, sellerId: true, logisticsPartnerId: true } });
  if (!job?.riderId) return null;
  if (side.kind === "rider" && job.riderId !== side.riderId) return null;
  if (side.kind === "shop" && job.sellerId !== side.userId) return null;
  if (side.kind === "company") return null;
  return job as typeof job & { riderId: string };
}

/** The thread's messages, oldest first; the other side's unread ones are marked read. Null when not allowed. */
export async function riderThread(side: RiderSide, input: { audience: RiderAudience; riderId?: string; bookingId?: string }) {
  let where: { riderId: string; audience: RiderAudience; bookingId?: string | null };
  if (input.audience === "company") {
    if (side.kind === "shop") return null;
    const riderId = side.kind === "rider" ? side.riderId : input.riderId;
    if (!riderId) return null;
    if (side.kind === "company") {
      const rider = await db.logisticsTeamMember.findFirst({ where: { id: riderId, logisticsPartnerId: side.partnerId, role: "rider" }, select: { id: true } });
      if (!rider) return null;
    }
    where = { riderId, audience: "company", bookingId: null };
  } else {
    if (!input.bookingId) return null;
    const job = await jobFor(side, input.bookingId);
    if (!job) return null;
    where = { riderId: job.riderId, audience: "shop", bookingId: job.id };
  }
  const rows = await db.riderMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: MAX_LIST, select: { id: true, body: true, fromRider: true, createdAt: true, readAt: true } });
  await db.riderMessage.updateMany({ where: { ...where, readAt: null, fromRider: side.kind !== "rider" }, data: { readAt: new Date() } }).catch(() => null);
  return rows.reverse().map((row) => view(row, side.kind));
}

/** Sends one message on a thread; the same rules as riderThread. */
export async function sendRiderMessage(side: RiderSide, input: { audience: RiderAudience; riderId?: string; bookingId?: string; body: unknown }) {
  const body = cleanRiderMessage(input.body);
  if (!body) return { ok: false as const, error: "Type a message first." };
  let data: { riderId: string; logisticsPartnerId: string; bookingId: string | null; audience: RiderAudience };
  if (input.audience === "company") {
    if (side.kind === "shop") return { ok: false as const, error: "Not allowed." };
    const riderId = side.kind === "rider" ? side.riderId : input.riderId;
    const rider = riderId ? await db.logisticsTeamMember.findFirst({ where: { id: riderId, logisticsPartnerId: side.partnerId, role: "rider" }, select: { id: true } }) : null;
    if (!rider) return { ok: false as const, error: "We couldn't find that rider." };
    data = { riderId: rider.id, logisticsPartnerId: side.partnerId, bookingId: null, audience: "company" };
  } else {
    const job = input.bookingId ? await jobFor(side, input.bookingId) : null;
    if (!job) return { ok: false as const, error: "This job isn't yours to message about." };
    data = { riderId: job.riderId, logisticsPartnerId: job.logisticsPartnerId, bookingId: job.id, audience: "shop" };
  }
  const row = await db.riderMessage.create({
    data: { ...data, fromRider: side.kind === "rider", senderUserId: side.kind === "rider" ? null : side.userId, body },
    select: { id: true, body: true, fromRider: true, createdAt: true, readAt: true },
  });
  await tellTheOtherSide(side, data, body).catch((error) => console.error("[rider-chat] notify failed", error));
  return { ok: true as const, message: view(row, side.kind) };
}

/**
 * A push to whoever didn't write it: the rider, the company's owner, or the shop. Each side's message settings
 * decide (shared/message-notifications.ts): the rider's own switches and quiet hours, the partner's "Messages from
 * riders" switch, and everyone's Messages switches and quiet hours.
 */
async function tellTheOtherSide(side: RiderSide, data: { riderId: string; logisticsPartnerId: string; bookingId: string | null; audience: RiderAudience }, body: string) {
  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  if (side.kind !== "rider") {
    const from = side.kind === "company"
      ? (await db.logisticsPartner.findUnique({ where: { id: data.logisticsPartnerId }, select: { displayName: true } }))?.displayName ?? "Your company"
      : "The shop";
    const route = data.audience === "shop" ? `/rider/chat?with=shop&job=${data.bookingId}` : "/rider/chat?with=company";
    await notifyRider({ riderId: data.riderId, event: "rider.message", title: `Message from ${from}`, body: preview, route, dedupeKey: null, messageFrom: data.audience === "shop" ? "shops" : "company" });
    return;
  }
  const rider = await db.logisticsTeamMember.findUnique({ where: { id: data.riderId }, select: { name: true } });
  const riderName = rider?.name ?? "Your rider";
  if (data.audience === "company") {
    const partner = await db.logisticsPartner.findUnique({ where: { id: data.logisticsPartnerId }, select: { userId: true } });
    // The web riders page; the phone opens the chat with this rider (appRouteFor, shared/notifications.ts).
    if (partner) await notify({ userId: partner.userId, event: "message.new", title: `${riderName} sent a message`, description: preview, link: `/logistics/inbox?rider=${data.riderId}`, dedupeKey: false, messageSource: "riders" });
    return;
  }
  const job = data.bookingId ? await db.deliveryBooking.findUnique({ where: { id: data.bookingId }, select: { sellerId: true, orderId: true } }) : null;
  // The order (where "Message the rider" is); the phone opens the order screen.
  if (job) await notify({ userId: job.sellerId, event: "message.new", title: `${riderName} (your rider) sent a message`, description: preview, link: job.orderId ? `/home/orders/${job.orderId}` : "/home/logistics", dedupeKey: false, messageSource: "riders" });
}

// ─── Chat lists ─────────────────────────────────────────────────────────────

/**
 * The company's chats with its riders (the web Messages page, the Today cards, the phone's Chats tab): every rider
 * on the team, plus anyone who left but has a chat, with the last message and the rider's unread messages.
 */
export async function listRiderThreads(partnerId: string): Promise<RiderChatSummary[]> {
  const where = { logisticsPartnerId: partnerId, audience: "company", bookingId: null };
  const [riders, lastRows, unreadRows] = await Promise.all([
    db.logisticsTeamMember.findMany({ where: { logisticsPartnerId: partnerId, role: "rider" }, select: { id: true, name: true, phone: true, status: true }, take: 500 }),
    // The newest message per rider.
    db.riderMessage.findMany({ where, orderBy: { createdAt: "desc" }, distinct: ["riderId"], take: 500, select: { riderId: true, body: true, fromRider: true, createdAt: true, readAt: true } }),
    db.riderMessage.groupBy({ by: ["riderId"], where: { ...where, fromRider: true, readAt: null }, _count: { _all: true } }),
  ]);
  const unread = new Map(unreadRows.map((row) => [row.riderId, row._count._all]));
  return riderThreadSummaries(riders, lastRows, unread);
}

/** Unread rider messages for the company (the sidebar's Messages badge adds these to partner chats). */
export async function riderUnreadForPartner(partnerId: string) {
  return db.riderMessage.count({ where: { logisticsPartnerId: partnerId, audience: "company", bookingId: null, fromRider: true, readAt: null } });
}

/** The rider's "Messages" card: the company chat and the shops on their recent jobs, with unread counts. */
export async function riderInbox(rider: { riderId: string; partnerName: string }): Promise<RiderInboxSummary> {
  const rows = await db.riderMessage.findMany({
    where: { riderId: rider.riderId },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { bookingId: true, audience: true, body: true, fromRider: true, createdAt: true, readAt: true },
  });
  const jobIds = [...new Set(rows.map((row) => row.bookingId).filter((id): id is string => Boolean(id)))].slice(0, 20);
  const jobs = jobIds.length
    ? await db.deliveryBooking.findMany({ where: { id: { in: jobIds }, riderId: rider.riderId }, select: { id: true, seller: { select: { name: true, store: { select: { name: true } } } } } })
    : [];
  const names = new Map(jobs.map((job) => [job.id, job.seller.store?.name ?? job.seller.name]));
  // Only jobs the rider still carries (a job handed to another rider drops out of their list).
  return riderInboxSummary(rows.filter((row) => !row.bookingId || names.has(row.bookingId)), rider.partnerName, names);
}

// ─── Reviews ────────────────────────────────────────────────────────────────

const secret = () => process.env.RIDER_REVIEW_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sign(bookingId: string) {
  return createHmac("sha256", secret()).update(`rider-review:${bookingId}`).digest("base64url").slice(0, 22);
}

/** The customer's review link for a delivered job (the rider sends it), or null when it can't be made. */
export function riderReviewUrl(bookingId: string) {
  if (!secret()) return null;
  return `${getPublicEnv().appUrl.replace(/\/$/, "")}/rate-rider/${bookingId}.${sign(bookingId)}`;
}

/** The job a review code is for, or null when the code isn't one we made. */
export function bookingFromReviewCode(code: string): string | null {
  const [bookingId, signature] = String(code).split(".");
  if (!bookingId || !signature || !secret() || !/^[\w-]{8,40}$/.test(bookingId)) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(bookingId));
  return a.length === b.length && timingSafeEqual(a, b) ? bookingId : null;
}

/** What the review page shows: the rider's first name, the company, and whether it's already rated. */
export async function reviewTarget(bookingId: string) {
  const job = await db.deliveryBooking.findUnique({ where: { id: bookingId }, select: { id: true, status: true, riderId: true, logisticsPartnerId: true, logisticsPartner: { select: { displayName: true } } } });
  if (!job?.riderId || job.status !== "delivered") return null;
  const [rider, existing] = await Promise.all([
    db.logisticsTeamMember.findUnique({ where: { id: job.riderId }, select: { name: true } }),
    db.riderReview.findUnique({ where: { bookingId }, select: { rating: true } }),
  ]);
  return { riderName: (rider?.name ?? "your rider").split(" ")[0], company: job.logisticsPartner.displayName, rated: existing?.rating ?? null, riderId: job.riderId, partnerId: job.logisticsPartnerId };
}

/** Saves the customer's rating once per delivered job. */
export async function saveRiderReview(code: string, input: { rating?: unknown; comment?: unknown }) {
  const bookingId = bookingFromReviewCode(code);
  if (!bookingId) return { ok: false as const, error: "This review link doesn't work. Ask your rider for a new one." };
  const target = await reviewTarget(bookingId);
  if (!target) return { ok: false as const, error: "This delivery can't be rated yet." };
  if (target.rated) return { ok: false as const, error: "Thanks, this delivery is already rated." };
  const review = cleanRiderReview(input);
  if (!review) return { ok: false as const, error: "Pick from 1 to 5 stars." };
  await db.riderReview.create({ data: { bookingId, riderId: target.riderId, logisticsPartnerId: target.partnerId, ...review } });
  return { ok: true as const };
}

/** A rider's rating ("4.8 from 12"), for the riders app and the company. */
export async function riderRating(riderId: string) {
  const rows = await db.riderReview.findMany({ where: { riderId }, select: { rating: true }, orderBy: { createdAt: "desc" }, take: 500 });
  return ratingSummary(rows.map((row) => row.rating));
}
