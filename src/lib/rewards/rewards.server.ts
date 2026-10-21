import "server-only";

import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { ensureCreditAccount } from "@/lib/ai/credits.server";
import { CREDIT_REFERENCE_PREFIX } from "@shared/ai-credits";
import {
  FAST_CHAT_REPLY_MS,
  FAST_JOB_ACCEPT_MS,
  FAST_SUPPLIER_ACCEPT_MS,
  SWAP,
  asRewardRole,
  badgeEarned,
  canSwap,
  catalogFor,
  challengeView,
  currentStreak,
  deliveredOnTime,
  eventReward,
  isRewardKind,
  lagosDay,
  lagosDayStart,
  levelFor,
  updateStreak,
  weekResetsAt,
  weekStart,
  within,
  type RewardKind,
  type RewardRole,
} from "./rules";

// Rewards on the database (rules in ./rules.ts). Every reward is one RewardEvent, unique on (userId, kind, ref):
// recordRewardEvent is called fire-and-forget from the existing flows (order paid, order accepted, delivery done,
// status posted, product added, quote sent…), is safe to call any number of times and never throws. Challenge
// progress is this Lagos week's RewardEvent count of the challenge's kind. Points only swap for free AI credits
// (100 → 20, an AiCreditPurchase row with packId "reward_swap", like a plan's credits); never cash.

export class RewardsError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export interface RewardsView {
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
  swap: { points: 100; credits: 20; canSwap: boolean };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isUniqueError = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

async function roleOf(userId: string): Promise<RewardRole | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return asRewardRole(user?.role);
}

async function eventCounts(userId: string, since?: Date) {
  const rows = await db.rewardEvent.groupBy({
    by: ["kind"],
    where: { userId, ...(since ? { createdAt: { gte: since } } : {}) },
    _count: { _all: true },
  });
  const counts: Partial<Record<RewardKind, number>> = {};
  for (const row of rows) if (isRewardKind(row.kind)) counts[row.kind] = row._count._all;
  return counts;
}

/**
 * Saves the role's badges that are earned now and weren't yet (they stay earned, even when a streak breaks).
 * Returns every badge row the user has.
 */
async function syncBadges(userId: string, role: RewardRole, input: { counts: Partial<Record<RewardKind, number>>; streak: number }) {
  const [stored, partner] = await Promise.all([
    db.userBadge.findMany({ where: { userId } }),
    role === "logistics_partner" ? db.logisticsPartner.findUnique({ where: { userId }, select: { verificationStatus: true } }) : null,
  ]);
  const have = new Set(stored.map((badge) => badge.key));
  const stats = { counts: input.counts, streak: input.streak, verified: partner?.verificationStatus === "verified" };
  const fresh = catalogFor(role).badges.filter((badge) => !have.has(badge.key) && badgeEarned(badge.rule, stats));
  if (!fresh.length) return stored;
  await db.userBadge.createMany({ data: fresh.map((badge) => ({ userId, key: badge.key })), skipDuplicates: true });
  return db.userBadge.findMany({ where: { userId } });
}

/**
 * Records one rewarded action. Idempotent on (userId, kind, ref): the second call adds nothing and returns null.
 * Never throws (logs and swallows), so callers can fire and forget. Returns what it added and the streak, for
 * "+15 points · streak 3" (the Status backend).
 */
export async function recordRewardEvent(input: { userId: string; kind: string; ref: string; at?: Date }): Promise<{ points: number; streak: number } | null> {
  try {
    const { userId, kind } = input;
    const ref = String(input.ref ?? "").slice(0, 191);
    if (!userId || !ref || !isRewardKind(kind)) {
      console.warn(`[rewards] ignored event ${kind} for ${userId || "nobody"}`);
      return null;
    }
    const at = input.at ?? new Date();
    const dayStart = lagosDayStart(at);
    const alreadyToday = await db.rewardEvent.count({ where: { userId, kind, createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) } } });
    const reward = eventReward(kind, alreadyToday);
    const today = lagosDay(at);

    const result = await db.$transaction(async (tx) => {
      await tx.rewardEvent.create({ data: { userId, kind, ref, xp: reward.xp, points: reward.points, createdAt: at } });
      const account = await tx.rewardAccount.findUnique({ where: { userId } });
      const streak = updateStreak({ streak: account?.streak ?? 0, lastActiveDay: account?.lastActiveDay ?? null }, today);
      await tx.rewardAccount.upsert({
        where: { userId },
        create: { userId, xp: reward.xp, points: reward.points, ...streak },
        update: { xp: { increment: reward.xp }, points: { increment: reward.points }, ...streak },
      });
      return { points: reward.points, streak: streak.streak };
    });

    const role = await roleOf(userId);
    if (role) await syncBadges(userId, role, { counts: await eventCounts(userId), streak: result.streak });
    return result;
  } catch (error) {
    if (isUniqueError(error)) return null; // already counted
    console.error(`[rewards] could not record ${input.kind}:${input.ref} for ${input.userId}`, error);
    return null;
  }
}

/** The Rewards screen: level, XP, points, streak, this week's challenges, badges and the swap. */
export async function rewardsFor(userId: string, now = new Date()): Promise<RewardsView> {
  const role = await roleOf(userId);
  if (!role) throw new RewardsError("FORBIDDEN", "Rewards are for sellers, suppliers and delivery partners.", 403);
  const catalog = catalogFor(role);
  const start = weekStart(now);
  const [account, lifetime, thisWeek, claims] = await Promise.all([
    db.rewardAccount.findUnique({ where: { userId } }),
    eventCounts(userId),
    eventCounts(userId, start),
    db.challengeClaim.findMany({ where: { userId, weekStart: start }, select: { key: true } }),
  ]);
  const badges = await syncBadges(userId, role, { counts: lifetime, streak: account?.streak ?? 0 });
  const earned = new Map(badges.map((badge) => [badge.key, badge.earnedAt]));
  const claimed = new Set(claims.map((claim) => claim.key));
  const xp = account?.xp ?? 0;
  const points = account?.points ?? 0;

  return {
    ...levelFor(role, xp),
    xp,
    points,
    streak: currentStreak(account, lagosDay(now)),
    challenges: catalog.challenges.map((def) => challengeView(def, thisWeek[def.kind] ?? 0, claimed.has(def.key))),
    resetsAt: weekResetsAt(now).toISOString(),
    badges: catalog.badges.map((def) => {
      const at = earned.get(def.key);
      return { key: def.key, title: def.title, earned: Boolean(at), earnedAt: at ? at.toISOString() : null };
    }),
    swap: { points: SWAP.points, credits: SWAP.credits, canSwap: canSwap(points) },
  };
}

/** Claims a finished challenge this week: its points (and the same XP), once per week. */
export async function claimChallenge(userId: string, key: string, now = new Date()): Promise<RewardsView> {
  const role = await roleOf(userId);
  if (!role) throw new RewardsError("FORBIDDEN", "Rewards are for sellers, suppliers and delivery partners.", 403);
  const def = catalogFor(role).challenges.find((challenge) => challenge.key === key);
  if (!def) throw new RewardsError("NOT_FOUND", "That challenge isn't on your list this week.", 404);
  const start = weekStart(now);
  const done = await db.rewardEvent.count({ where: { userId, kind: def.kind, createdAt: { gte: start } } });
  if (done < def.target) throw new RewardsError("CHALLENGE_NOT_DONE", "Finish this challenge first, then claim it.", 409);
  try {
    await db.$transaction([
      db.challengeClaim.create({ data: { userId, key: def.key, weekStart: start, points: def.points } }),
      db.rewardAccount.upsert({
        where: { userId },
        create: { userId, xp: def.points, points: def.points },
        update: { xp: { increment: def.points }, points: { increment: def.points } },
      }),
    ]);
  } catch (error) {
    // A double tap: the first claim already counted.
    if (!isUniqueError(error)) throw error;
  }
  return rewardsFor(userId, now);
}

/** Swaps 100 points for 20 free AI credits, in one transaction, only with at least 100 points. Never cash. */
export async function swapPoints(userId: string): Promise<{ rewards: RewardsView; creditsAdded: number }> {
  const role = await roleOf(userId);
  if (!role) throw new RewardsError("FORBIDDEN", "Rewards are for sellers, suppliers and delivery partners.", 403);
  await ensureCreditAccount(userId);
  await db.$transaction(async (tx) => {
    const taken = await tx.rewardAccount.updateMany({ where: { userId, points: { gte: SWAP.points } }, data: { points: { decrement: SWAP.points } } });
    if (taken.count !== 1) throw new RewardsError("NOT_ENOUGH_POINTS", `You need ${SWAP.points} points to swap for ${SWAP.credits} credits.`, 409);
    await tx.aiCreditPurchase.create({
      data: { reference: `${CREDIT_REFERENCE_PREFIX}reward-${crypto.randomUUID()}`, userId, packId: "reward_swap", credits: SWAP.credits, amountKobo: 0, status: "paid", paidAt: new Date() },
    });
    await tx.aiCreditAccount.update({ where: { userId }, data: { balance: { increment: SWAP.credits } } });
  });
  return { rewards: await rewardsFor(userId), creditsAdded: SWAP.credits };
}

// ─── Hooks: one-line calls from the existing flows ───────────────────────────
// Each looks up who gets the reward and fires recordRewardEvent. None of them throw.

function quietly(task: () => Promise<unknown>, what: string): Promise<void> {
  return task().then(
    () => undefined,
    (error) => console.error(`[rewards] ${what} failed`, error),
  );
}

/** Supplier accepted a dropship order: counted, "fast" within 2 hours of it arriving, and a new shop supplied. */
export function rewardSupplierOrderAccepted(supplierOrderId: string): Promise<void> {
  return quietly(async () => {
    const order = await db.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { id: true, createdAt: true, acceptedAt: true, sellerId: true, supplier: { select: { userId: true } } } });
    if (!order?.acceptedAt) return;
    const userId = order.supplier.userId;
    await recordRewardEvent({ userId, kind: "order_accepted", ref: order.id, at: order.acceptedAt });
    if (within(order.createdAt, order.acceptedAt, FAST_SUPPLIER_ACCEPT_MS)) await recordRewardEvent({ userId, kind: "order_accepted_fast", ref: order.id, at: order.acceptedAt });
    await recordRewardEvent({ userId, kind: "shop_supplied", ref: order.sellerId, at: order.acceptedAt });
  }, `supplier order ${supplierOrderId}`);
}

/** A shop order was paid: the seller's order. */
export function rewardOrderPaid(retailOrderId: string): Promise<void> {
  return quietly(async () => {
    const order = await db.retailOrder.findUnique({ where: { id: retailOrderId }, select: { id: true, store: { select: { userId: true } } } });
    if (order) await recordRewardEvent({ userId: order.store.userId, kind: "order_paid", ref: order.id });
  }, `order ${retailOrderId}`);
}

/** A delivery job moved: delivered (and on time), or accepted within 30 minutes. */
export function rewardJobMoved(bookingId: string, to: string): Promise<void> {
  if (to !== "delivered" && to !== "confirmed") return Promise.resolve();
  return quietly(async () => {
    const job = await db.deliveryBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, createdAt: true, acceptedAt: true, deliveredAt: true, estimatedDelivery: true, failedAttempts: true, logisticsPartner: { select: { userId: true } } },
    });
    const userId = job?.logisticsPartner?.userId;
    if (!job || !userId) return;
    if (to === "delivered" && job.deliveredAt) {
      await recordRewardEvent({ userId, kind: "delivery_done", ref: job.id, at: job.deliveredAt });
      if (deliveredOnTime(job)) await recordRewardEvent({ userId, kind: "delivery_on_time", ref: job.id, at: job.deliveredAt });
    }
    if (to === "confirmed" && job.acceptedAt && within(job.createdAt, job.acceptedAt, FAST_JOB_ACCEPT_MS)) {
      await recordRewardEvent({ userId, kind: "job_accepted_fast", ref: job.id, at: job.acceptedAt });
    }
  }, `job ${bookingId}`);
}

/** The seller answered a customer: counted once per customer message, when it was under an hour old. */
export function rewardChatReply(userId: string, conversationId: string, repliedAt: Date): Promise<void> {
  return quietly(async () => {
    const asked = await db.inboxMessage.findFirst({
      where: { conversationId, direction: "inbound", createdAt: { lte: repliedAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
    if (asked && within(asked.createdAt, repliedAt, FAST_CHAT_REPLY_MS)) await recordRewardEvent({ userId, kind: "chat_replied_fast", ref: asked.id, at: repliedAt });
  }, `chat reply ${conversationId}`);
}
