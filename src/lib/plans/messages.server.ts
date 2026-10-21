import "server-only";
import { db } from "@/lib/db/client";
import { planKeyFor, sellerLimits } from "@shared/plans";
import { messagesLeft } from "@shared/plan-extras";

// SMS and WhatsApp messages Shopinbos sends for a store through its own providers (src/lib/marketing/channels.ts;
// a store's own connected SMS or WhatsApp number isn't counted, its provider bills the seller). Each month the plan
// includes some (shared/plans.ts messagesIncluded, SMS and WhatsApp together); after that, messages come from packs
// (shared/plan-extras.ts), one per message. With neither, the message isn't sent and the reason is recorded.

export type MessageChannel = "sms" | "whatsapp";
export type MessageSpend = { ok: true; from: "plan" | "pack" | "unmetered" } | { ok: false; error: string };

const period = (now = new Date()) => now.toISOString().slice(0, 7);

async function ownerOf(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true, user: { select: { aiCredits: true } } } });
  return store ? { userId: store.userId, included: sellerLimits(planKeyFor("seller", store.user?.aiCredits)).messagesIncluded } : null;
}

/** Takes one message for `storeId` (plan first, then the channel's pack). Conditional updates keep it race-safe. */
export async function spendPlatformMessage(storeId: string, channel: MessageChannel): Promise<MessageSpend> {
  try {
    return await spend(storeId, channel);
  } catch (error) {
    // Before docs/migrations/2026-11-16-plan-extras.sql has run there's no MessageBalance table: don't stop messages.
    console.error("[messages] couldn't count the message; sending anyway", error);
    return { ok: true, from: "unmetered" };
  }
}

async function spend(storeId: string, channel: MessageChannel): Promise<MessageSpend> {
  const owner = await ownerOf(storeId).catch(() => null);
  if (!owner) return { ok: false, error: "Store not found" };
  const now = period();
  await db.messageBalance.upsert({ where: { userId: owner.userId }, create: { userId: owner.userId, period: now }, update: {} });
  await db.messageBalance.updateMany({ where: { userId: owner.userId, OR: [{ period: null }, { period: { not: now } }] }, data: { period: now, used: 0 } });
  if (owner.included > 0) {
    const plan = await db.messageBalance.updateMany({ where: { userId: owner.userId, period: now, used: { lt: owner.included } }, data: { used: { increment: 1 } } });
    if (plan.count === 1) return { ok: true, from: "plan" };
  }
  const pack = await db.messageBalance.updateMany({ where: { userId: owner.userId, [channel]: { gt: 0 } }, data: { [channel]: { decrement: 1 } } });
  if (pack.count === 1) return { ok: true, from: "pack" };
  return {
    ok: false,
    error: owner.included > 0
      ? `This month's ${owner.included} included messages are used up. Buy a ${channel === "sms" ? "SMS" : "WhatsApp"} pack in Settings › Billing to keep sending.`
      : `Messages sent by Shopinbos need a ${channel === "sms" ? "SMS" : "WhatsApp"} pack (Settings › Billing), or connect your own ${channel === "sms" ? "SMS provider" : "WhatsApp number"}.`,
  };
}

/** Gives a message back when the provider didn't send it. */
export async function returnPlatformMessage(storeId: string, channel: MessageChannel, spend: MessageSpend) {
  if (!spend.ok || spend.from === "unmetered") return;
  const owner = await ownerOf(storeId).catch(() => null);
  if (!owner) return;
  await db.messageBalance
    .updateMany({ where: { userId: owner.userId }, data: spend.from === "plan" ? { used: { decrement: 1 } } : { [channel]: { increment: 1 } } })
    .catch(() => null);
}

/** For the billing page: included this month, used, packs left, and the total left. */
export async function messageAllowance(userId: string) {
  const [user, balance] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } }),
    db.messageBalance.findUnique({ where: { userId } }).catch(() => null),
  ]);
  const included = sellerLimits(planKeyFor("seller", user?.aiCredits)).messagesIncluded;
  const used = balance?.period === period() ? balance.used : 0;
  const sms = balance?.sms ?? 0;
  const whatsapp = balance?.whatsapp ?? 0;
  return { included, used, sms, whatsapp, smsLeft: messagesLeft(included, used, sms), whatsappLeft: messagesLeft(included, used, whatsapp) };
}
