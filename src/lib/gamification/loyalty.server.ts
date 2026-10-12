import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isMissingTable } from "./config.server";
import {
  EARNING_STATUSES,
  VOID_STATUSES,
  loyaltyTier,
  nextTier,
  pointsForSpend,
  redeemablePoints,
  tierMultiplier,
  type LoyaltySettings,
  type LoyaltyTier,
} from "./logic";

// Loyalty points per shopper (by email). Points are earned on orders once they are paid (or later), taken
// back if the order is cancelled or refunded, and points spent on an order come back if it is cancelled.
// Rather than hooking every place an order changes status, the ledger is brought up to date from the orders
// themselves whenever a balance is read (idempotent: one ledger row per account, order and kind).
// Everything returns null until the gamification SQL is applied, so checkout never breaks.

export interface LoyaltySummary {
  accountId: string;
  balance: number;
  lifetimeEarned: number;
  tier: LoyaltyTier;
  next: { tier: LoyaltyTier; remaining: number } | null;
}

/** Last 10 digits, so 0803…, +234803… and 234803… match. */
export function phoneTail(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : "";
}

async function ensureAccount(storeId: string, email: string, phone: string | null) {
  return db.loyaltyAccount.upsert({
    where: { storeId_email: { storeId, email } },
    create: { storeId, email, phone },
    update: phone ? { phone } : {},
  });
}

/**
 * Brings one shopper's points up to date with their orders and returns the summary. Creates the account the
 * first time they have an order that earns. Null when points are off, tables are missing, or nothing to show.
 */
export async function syncLoyalty(storeId: string, emailRaw: string, settings: LoyaltySettings): Promise<LoyaltySummary | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !settings.enabled) return null;
  try {
    const since = settings.startedAt ? new Date(settings.startedAt) : null;
    const orders = await db.retailOrder.findMany({
      where: { storeId, buyerEmail: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, subtotal: true, discountAmount: true, buyerPhone: true, createdAt: true },
      take: 500,
    });
    let account = await db.loyaltyAccount.findUnique({ where: { storeId_email: { storeId, email } } });
    const earning = orders.filter((order) => EARNING_STATUSES.includes(order.status) && (!since || order.createdAt >= since));
    if (!account && !earning.length) return null;
    const latestPhone = [...orders].reverse().find((order) => order.buyerPhone)?.buyerPhone ?? null;
    if (!account) account = await ensureAccount(storeId, email, latestPhone);

    const ledger = await db.loyaltyLedger.findMany({ where: { accountId: account.id }, select: { kind: true, points: true, orderId: true } });
    const has = (orderId: string, kind: string) => ledger.some((row) => row.orderId === orderId && row.kind === kind);
    let lifetime = ledger.filter((row) => row.kind === "earn" || row.kind === "reverse").reduce((sum, row) => sum + row.points, 0);
    const rows: Prisma.LoyaltyLedgerCreateManyInput[] = [];
    for (const order of orders) {
      const voided = VOID_STATUSES.includes(order.status);
      const earned = ledger.find((row) => row.orderId === order.id && row.kind === "earn");
      if (!earned && !voided && earning.includes(order)) {
        // Products paid for, after discounts and points (delivery doesn't earn); the tier at the time sets the rate.
        const base = Math.max(0, order.subtotal - Number(order.discountAmount ?? 0));
        const points = pointsForSpend(base, settings, tierMultiplier(loyaltyTier(lifetime, settings), settings));
        if (points > 0) {
          rows.push({ storeId, accountId: account.id, kind: "earn", points, orderId: order.id });
          lifetime += points;
        }
      }
      if (voided && earned && !has(order.id, "reverse")) {
        rows.push({ storeId, accountId: account.id, kind: "reverse", points: -earned.points, orderId: order.id, note: `Order ${order.status}` });
        lifetime -= earned.points;
      }
      const spent = ledger.find((row) => row.orderId === order.id && row.kind === "redeem");
      if (voided && spent && !has(order.id, "refund")) {
        rows.push({ storeId, accountId: account.id, kind: "refund", points: -spent.points, orderId: order.id, note: `Order ${order.status}` });
      }
    }
    if (rows.length) await db.loyaltyLedger.createMany({ data: rows, skipDuplicates: true });

    // The balance is always the ledger's sum (the cached columns are for quick reads and the seller's stats).
    const [sum, earnedSum] = await Promise.all([
      db.loyaltyLedger.aggregate({ where: { accountId: account.id }, _sum: { points: true } }),
      db.loyaltyLedger.aggregate({ where: { accountId: account.id, kind: { in: ["earn", "reverse"] } }, _sum: { points: true } }),
    ]);
    const balance = Math.max(0, sum._sum.points ?? 0);
    const lifetimeEarned = Math.max(0, earnedSum._sum.points ?? 0);
    if (balance !== account.balance || lifetimeEarned !== account.lifetimeEarned || (latestPhone && !account.phone)) {
      await db.loyaltyAccount.update({ where: { id: account.id }, data: { balance, lifetimeEarned, ...(latestPhone && !account.phone ? { phone: latestPhone } : {}) } });
    }
    return { accountId: account.id, balance, lifetimeEarned, tier: loyaltyTier(lifetimeEarned, settings), next: nextTier(lifetimeEarned, settings) };
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

/**
 * The balance a shopper can spend at checkout. Spending needs the email and the phone number from one of
 * their earlier orders (or saved on their account), so typing someone else's email isn't enough.
 */
export async function verifiedLoyalty(storeId: string, email: string | null | undefined, phone: string | null | undefined, settings: LoyaltySettings) {
  const tail = phoneTail(phone);
  if (!email || !tail) return null;
  const summary = await syncLoyalty(storeId, email, settings);
  if (!summary) return null;
  try {
    const account = await db.loyaltyAccount.findUnique({ where: { id: summary.accountId }, select: { phone: true } });
    if (phoneTail(account?.phone) === tail) return summary;
    const orders = await db.retailOrder.findMany({ where: { storeId, buyerEmail: { equals: email.trim(), mode: "insensitive" }, buyerPhone: { not: null } }, select: { buyerPhone: true }, take: 50 });
    return orders.some((order) => phoneTail(order.buyerPhone) === tail) ? summary : null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

export interface PointsRedemption {
  accountId: string;
  points: number;
  amount: number;
  balance: number;
  max: number;
}

/** What `requested` points take off a bag whose products cost `base` (after any code). Null = no points apply. */
export async function quotePoints(input: { storeId: string; email?: string | null; phone?: string | null; requested: number; base: number; settings: LoyaltySettings }): Promise<PointsRedemption | null> {
  if (!input.settings.enabled || input.requested <= 0) return null;
  const summary = await verifiedLoyalty(input.storeId, input.email, input.phone, input.settings);
  if (!summary) return null;
  const quote = redeemablePoints({ balance: summary.balance, base: input.base, requested: input.requested }, input.settings);
  if (quote.points <= 0 || quote.amount <= 0) return null;
  return { accountId: summary.accountId, points: quote.points, amount: quote.amount, balance: summary.balance, max: quote.max };
}

/** Inside the order transaction: takes the points off (only if the balance still covers them) and logs it. */
export async function spendPoints(tx: Prisma.TransactionClient, input: { storeId: string; accountId: string; orderId: string; points: number }) {
  const updated = await tx.loyaltyAccount.updateMany({ where: { id: input.accountId, storeId: input.storeId, balance: { gte: input.points } }, data: { balance: { decrement: input.points } } });
  if (updated.count !== 1) throw new Error("Insufficient points: your points balance changed. Check your order and try again.");
  await tx.loyaltyLedger.create({ data: { storeId: input.storeId, accountId: input.accountId, kind: "redeem", points: -input.points, orderId: input.orderId } });
}

/** For the order page: points used on and earned from this order, and the shopper's balance now. */
export async function orderLoyalty(storeId: string, order: { id: string; buyerEmail: string; status: string; subtotal: number; discountAmount: number | null }, settings: LoyaltySettings) {
  if (!settings.enabled) return null;
  const summary = await syncLoyalty(storeId, order.buyerEmail, settings);
  try {
    const rows = summary ? await db.loyaltyLedger.findMany({ where: { accountId: summary.accountId, orderId: order.id }, select: { kind: true, points: true } }) : [];
    const earned = rows.find((row) => row.kind === "earn")?.points ?? 0;
    const used = -(rows.find((row) => row.kind === "redeem")?.points ?? 0);
    // Not paid yet: what it will earn once it is (at the current tier).
    const pending = !earned && !VOID_STATUSES.includes(order.status) && !EARNING_STATUSES.includes(order.status)
      ? pointsForSpend(Math.max(0, order.subtotal - Number(order.discountAmount ?? 0)), settings, tierMultiplier(summary?.tier ?? "bronze", settings))
      : 0;
    return { earned, pending, used, usedValue: used * settings.pointValue, balance: summary?.balance ?? 0, tier: summary?.tier ?? ("bronze" as LoyaltyTier), next: summary?.next ?? nextTier(0, settings) };
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}
