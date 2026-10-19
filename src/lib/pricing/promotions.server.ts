import "server-only";

import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appOrigin } from "@/lib/ads";
import { notify } from "@/lib/notifications/notify.server";
import { createBroadcast, deleteDraft, startBroadcast, updateBroadcast } from "@/lib/email/product-news.server";
import { clearPriceBookCache, getPricingSnapshot } from "./price-book.server";
import {
  announcementBody,
  changeLines,
  overlappingPromotions,
  promotionChanges,
  promotionProblem,
  promotionState,
  untilText,
  type PromoAudience,
  type PromoInput,
} from "@shared/price-promotions";

// Price promotions (Admin › Pricing › Promotions). The rules are in shared/price-promotions.ts; the prices take
// effect through the price book (./price-book.server.ts). Announcing:
//
//   * Email: a product-news broadcast (/admin/product-news) scheduled for the start, so it gets the same
//     preferences, unsubscribe link, batching and retries as other product news. Admins can edit it there.
//   * In-app notice + push: once it's live, runPromotionNotices (the product-news cron, every 10 minutes) sends one
//     notify() per person in batches, oldest account first, resuming from noticeCursor. The dedupe key means a
//     retried batch never notifies anyone twice.

export class PromotionError extends Error {}

const NOTICE_BATCH = 200;
/** The email is scheduled at least this far ahead so the cron sends it (never inside the admin's save). */
const EMAIL_LEAD_MS = 2 * 60_000;

const HOME_FOR: Record<PromoAudience, string> = { seller: "/home", supplier: "/supplier", logistics_partner: "/logistics/billing" };

export async function listPromotions() {
  return db.pricePromotion.findMany({
    orderBy: [{ startsAt: "desc" }],
    take: 100,
    include: { createdBy: { select: { name: true, email: true } } },
  });
}

async function others(exceptId?: string) {
  return db.pricePromotion.findMany({
    where: { status: { not: "cancelled" }, endsAt: { gt: new Date() }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true, status: true, startsAt: true, endsAt: true, prices: true },
  });
}

async function check(input: PromoInput, exceptId?: string) {
  const { base } = await getPricingSnapshot();
  const problem = promotionProblem(input, base);
  if (problem) throw new PromotionError(problem);
  const clash = overlappingPromotions(input, await others(exceptId));
  if (clash.length) throw new PromotionError(`“${clash[0].name}” changes the same price at the same time. Change the dates, or cancel that one first.`);
  return base;
}

function emailContent(input: PromoInput, base: Awaited<ReturnType<typeof check>>) {
  const audience = input.audience;
  return {
    subject: input.headline,
    preheader: untilText(input.endsAt),
    heading: input.headline,
    body: announcementBody(input, promotionChanges(input.prices, base)),
    imageUrl: null,
    ctaLabel: "Open Shopinbos",
    ctaUrl: `${appOrigin()}${audience.length === 1 ? HOME_FOR[audience[0]] : "/"}`,
    audience,
  };
}

async function scheduleEmail(broadcastId: string, startsAt: Date) {
  const at = new Date(Math.max(startsAt.getTime(), Date.now() + EMAIL_LEAD_MS));
  await startBroadcast(broadcastId, { scheduledAt: at });
}

export async function createPromotion(input: PromoInput, adminId: string) {
  const base = await check(input);
  const promo = await db.pricePromotion.create({
    data: {
      name: input.name.trim(),
      headline: input.headline.trim(),
      message: input.message?.trim() || null,
      prices: input.prices as Prisma.InputJsonValue,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      audience: input.audience,
      announceEmail: input.announceEmail,
      announceNotice: input.announceNotice,
      noticeStatus: input.announceNotice ? "pending" : "off",
      createdById: adminId,
    },
  });
  let saved = promo;
  if (input.announceEmail) {
    const broadcast = await createBroadcast(emailContent(input, base), adminId);
    await scheduleEmail(broadcast.id, input.startsAt);
    saved = await db.pricePromotion.update({ where: { id: promo.id }, data: { broadcastId: broadcast.id } });
  }
  clearPriceBookCache();
  return saved;
}

/** Only before it starts: after that, sellers may already have paid the promotion price. Cancel it instead. */
export async function updatePromotion(id: string, input: PromoInput, adminId: string) {
  const current = await db.pricePromotion.findUnique({ where: { id } });
  if (!current) throw new PromotionError("That promotion doesn't exist.");
  if (promotionState(current) !== "upcoming") throw new PromotionError("Only promotions that haven't started can be edited. End this one and create a new one.");
  const base = await check(input, id);
  let broadcastId = current.broadcastId;
  if (broadcastId && !input.announceEmail) {
    await deleteDraft(broadcastId).catch(() => undefined);
    broadcastId = null;
  } else if (input.announceEmail) {
    const content = emailContent(input, base);
    if (broadcastId) {
      const edited = await updateBroadcast(broadcastId, content).then(() => true).catch(() => false);
      if (!edited) broadcastId = null; // Already sent or deleted in Product news: make a fresh one.
    }
    if (!broadcastId) broadcastId = (await createBroadcast(content, adminId)).id;
    await scheduleEmail(broadcastId, input.startsAt);
  }
  const promo = await db.pricePromotion.update({
    where: { id },
    data: {
      name: input.name.trim(),
      headline: input.headline.trim(),
      message: input.message?.trim() || null,
      prices: input.prices as Prisma.InputJsonValue,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      audience: input.audience,
      announceEmail: input.announceEmail,
      announceNotice: input.announceNotice,
      noticeStatus: input.announceNotice ? "pending" : "off",
      broadcastId,
    },
  });
  clearPriceBookCache();
  return promo;
}

/** Cancels an upcoming promotion, or ends a live one now (prices go back to normal). An unsent email is deleted. */
export async function cancelPromotion(id: string) {
  const current = await db.pricePromotion.findUnique({ where: { id } });
  if (!current) throw new PromotionError("That promotion doesn't exist.");
  const state = promotionState(current);
  if (state === "ended" || state === "cancelled") return current;
  const now = new Date();
  const promo = await db.pricePromotion.update({
    where: { id },
    data:
      state === "live"
        ? { endsAt: now, cancelledAt: now, noticeStatus: current.noticeStatus === "sent" ? "sent" : "off" }
        : { status: "cancelled", cancelledAt: now, noticeStatus: "off" },
  });
  if (current.broadcastId) await deleteDraft(current.broadcastId).catch(() => undefined); // only if not sent yet
  clearPriceBookCache();
  return promo;
}

/** In-app notice + push for live promotions, in batches until `deadline`. Run by the product-news cron. */
export async function runPromotionNotices(now = new Date(), deadline = Date.now() + 60_000) {
  // A promotion that ended before its notices went out: too late to tell anyone.
  await db.pricePromotion.updateMany({ where: { noticeStatus: { in: ["pending", "sending"] }, OR: [{ endsAt: { lte: now } }, { status: "cancelled" }] }, data: { noticeStatus: "off" } });
  const due = await db.pricePromotion.findMany({
    where: { status: "scheduled", announceNotice: true, noticeStatus: { in: ["pending", "sending"] }, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  if (!due.length) return [];
  const { base } = await getPricingSnapshot();
  const results: Array<{ id: string; notified: number; done: boolean }> = [];
  for (const promo of due) {
    let cursor = promo.noticeCursor;
    let notified = 0;
    let done = false;
    const lines = changeLines(promotionChanges(promo.prices, base));
    const description = [promo.message?.trim(), lines.join(". "), untilText(promo.endsAt)].filter(Boolean).join(" · ").slice(0, 1900);
    if (promo.noticeStatus === "pending") await db.pricePromotion.updateMany({ where: { id: promo.id, noticeStatus: "pending" }, data: { noticeStatus: "sending" } });
    while (Date.now() < deadline) {
      const users = await db.user.findMany({
        where: { role: { in: promo.audience as Role[] }, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: "asc" },
        take: NOTICE_BATCH,
        select: { id: true, role: true },
      });
      for (const user of users) {
        const role = user.role as PromoAudience;
        await notify({
          userId: user.id,
          event: "pricing.promotion",
          // Delivery partners have no marketing category; theirs goes with account news.
          category: role === "logistics_partner" ? "account" : "marketing",
          priority: "success",
          title: promo.headline,
          description,
          link: HOME_FOR[role] ?? "/",
          dedupeKey: `price-promotion:${promo.id}`,
          metadata: { promotionId: promo.id },
        }).catch((error) => console.error(`[promotions] notice to ${user.id} failed`, error));
      }
      notified += users.length;
      cursor = users.at(-1)?.id ?? cursor;
      done = users.length < NOTICE_BATCH;
      await db.pricePromotion.update({ where: { id: promo.id }, data: { noticeCursor: cursor, noticeCount: { increment: users.length }, ...(done ? { noticeStatus: "sent" } : {}) } });
      if (done) break;
    }
    results.push({ id: promo.id, notified, done });
    if (Date.now() >= deadline) break;
  }
  return results;
}

/** Live promotions for this kind of account, with what they change (the banner on dashboards and price pages). */
export async function livePromotionsFor(role: string | null | undefined) {
  const { promotions, base } = await getPricingSnapshot();
  return promotions
    .filter((promo) => role && promo.audience.includes(role))
    .map((promo) => ({ id: promo.id, headline: promo.headline, message: promo.message, endsAt: promo.endsAt, changes: promotionChanges(promo.prices, base) }));
}
