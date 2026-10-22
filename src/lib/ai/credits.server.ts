import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { billingEmail } from "@/lib/auth/billing-email";
import { chargePaystackAuthorization, initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { readSavedAuthorization, savedAuthorization } from "@/lib/domains/billing-pure";
import { CREDIT_LIFETIME_MONTHS, CREDIT_REFERENCE_PREFIX, DEFAULT_AUTO_PACK, creditCosts, creditPack, creditPacksFrom, creditPeriod, packKobo, planFill, shouldAutoTopUp } from "@shared/ai-credits";
import { planKeyFor, monthlyCreditsFor, type PlanKey } from "@shared/plans";
import { isPlanTier } from "@shared/plan-catalog";
import { getPriceBook } from "@/lib/pricing/price-book.server";

// Buying AI credits and spending them (rules in shared/ai-credits.ts).
//
//   Two pots. The plan's monthly credits (planCredits) are refilled at the start of each month and never carried
//   over; bought, welcome and refunded credits are lots (AiCreditLot) that last 12 months each, and `balance` is
//   their total. Spending takes the plan's credits first, then the lot that expires soonest. Every read or spend goes
//   through `settle` inside a transaction holding the account row, so two requests can't spend the same credit.
//
//   checkout → Paystack → completeCreditPurchase (callback or webhook, either order, any number of times):
//   verified like the other Paystack payments, then ONE caller moves the row pending → paid and adds the credits.
//   With "top me up automatically" the reusable card is saved, and spendCredits charges it for the chosen pack when
//   the balance can't cover a request (at most AUTO_TOP_UP_PER_DAY times a day).

export class CreditError extends Error {}

/** Today's packs, per-request costs and welcome credits (Admin › Pricing). */
export async function liveCreditPrices() {
  const book = await getPriceBook();
  return { packs: creditPacksFrom(book), costs: creditCosts(book), welcome: book["credits.welcome"] };
}

export interface CreditOverview {
  /** Everything spendable: the plan's monthly credits plus bought credits. */
  balance: number;
  /** This month's plan credits left (reset at the start of next month). */
  planCredits: number;
  /** Bought, welcome and refunded credits, and when the next ones expire. */
  bought: number;
  nextExpiry: { credits: number; at: string } | null;
  autoTopUp: boolean;
  autoPackId: string | null;
  card: { brand: string | null; last4: string | null } | null;
  purchases: Array<{ reference: string; packId: string; credits: number; naira: number; status: string; auto: boolean; createdAt: string }>;
}

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

/**
 * The account, opened on first use with the welcome credits (a 12-month lot). Every balance read and write goes
 * through here or `settle`, so a new account never shows 0 on one screen and 50 on another.
 */
export async function ensureCreditAccount(userId: string) {
  try {
    const existing = await db.aiCreditAccount.findUnique({ where: { userId } });
    if (existing) return existing;
    const { welcome } = await liveCreditPrices();
    return await db.$transaction(async (tx) => {
      const account = await tx.aiCreditAccount.create({ data: { userId, balance: welcome } });
      if (welcome > 0) await tx.aiCreditLot.create({ data: { userId, credits: welcome, source: "welcome", expiresAt: addMonths(new Date(), CREDIT_LIFETIME_MONTHS) } });
      return account;
    });
  } catch (error) {
    // Two first requests at once: the other one opened the account.
    if ((error as { code?: string }).code === "P2002") return db.aiCreditAccount.findUniqueOrThrow({ where: { userId } });
    throw error;
  }
}

/** The plan a user's monthly credits are for, and how many it includes (Admin › Pricing › Plans for paid ones). */
async function planCreditsFor(userId: string): Promise<{ key: PlanKey; monthly: number }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, aiCredits: true } });
  const key = planKeyFor(user?.role, user?.aiCredits);
  const monthly = isPlanTier(key) ? (await getPlanCatalog()).creditsPerMonth[key] ?? monthlyCreditsFor(key) : monthlyCreditsFor(key);
  return { key, monthly };
}

type Tx = Prisma.TransactionClient;

/**
 * Brings the account up to date inside `tx`, holding its row: expired lots go to zero, a balance from before lots
 * existed becomes a 12-month lot, and the plan's credits are refilled for a new month (or topped up after an
 * upgrade). Returns the account as it is now.
 */
async function settle(tx: Tx, userId: string, plan: { key: PlanKey; monthly: number }, now = new Date()) {
  await tx.$queryRaw`SELECT "userId" FROM "AiCreditAccount" WHERE "userId" = ${userId} FOR UPDATE`;
  const account = await tx.aiCreditAccount.findUniqueOrThrow({ where: { userId } });
  await tx.aiCreditLot.updateMany({ where: { userId, credits: { gt: 0 }, expiresAt: { lte: now } }, data: { credits: 0 } });
  const live = await tx.aiCreditLot.aggregate({ where: { userId, credits: { gt: 0 } }, _sum: { credits: true } });
  let lots = live._sum.credits ?? 0;
  if (account.balance > lots && !(await tx.aiCreditLot.count({ where: { userId, source: "legacy" } }))) {
    // Credits bought before they expired: they get the full 12 months from today.
    await tx.aiCreditLot.create({ data: { userId, credits: account.balance - lots, source: "legacy", expiresAt: addMonths(now, CREDIT_LIFETIME_MONTHS) } });
    lots = account.balance;
  }
  const fill = planFill({ period: account.planPeriod, key: account.planKey, credits: account.planCredits }, plan, creditPeriod(now));
  const changed = lots !== account.balance || fill.credits !== account.planCredits || fill.period !== account.planPeriod || fill.key !== account.planKey;
  if (!changed) return account;
  return tx.aiCreditAccount.update({ where: { userId }, data: { balance: lots, planCredits: fill.credits, planPeriod: fill.period, planKey: fill.key } });
}

/** Settles the account in its own transaction and returns it. */
async function settled(userId: string) {
  await ensureCreditAccount(userId);
  const plan = await planCreditsFor(userId);
  return db.$transaction((tx) => settle(tx, userId, plan));
}

export async function creditOverview(userId: string): Promise<CreditOverview> {
  const [account, purchases, next] = await Promise.all([
    settled(userId),
    db.aiCreditPurchase.findMany({ where: { userId, status: { not: "pending" } }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.aiCreditLot.findFirst({ where: { userId, credits: { gt: 0 }, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" } }),
  ]);
  const card = readSavedAuthorization(account?.authorization);
  return {
    balance: account.planCredits + account.balance,
    planCredits: account.planCredits,
    bought: account.balance,
    nextExpiry: next ? { credits: next.credits, at: next.expiresAt.toISOString() } : null,
    autoTopUp: Boolean(account?.autoTopUp && card),
    autoPackId: account?.autoPackId ?? null,
    card: card ? { brand: card.brand, last4: card.last4 } : null,
    purchases: purchases.map((row) => ({ reference: row.reference, packId: row.packId, credits: row.credits, naira: row.amountKobo / 100, status: row.status, auto: row.auto, createdAt: row.createdAt.toISOString() })),
  };
}

/** Everything spendable: this month's plan credits plus bought credits. */
export async function creditBalance(userId: string) {
  const account = await settled(userId).catch(() => null);
  return account ? account.planCredits + account.balance : 0;
}

/** Adds bought, bonus or refunded credits as a 12-month lot. */
export async function addCredits(userId: string, credits: number, source: "purchase" | "refund" | "grant", reference?: string, tx?: Tx) {
  const amount = Math.round(credits);
  if (amount <= 0) return;
  const run = async (client: Tx) => {
    await client.aiCreditLot.create({ data: { userId, credits: amount, source, reference: reference ?? null, expiresAt: addMonths(new Date(), CREDIT_LIFETIME_MONTHS) } });
    await client.aiCreditAccount.update({ where: { userId }, data: { balance: { increment: amount } } });
  };
  if (tx) return run(tx);
  await ensureCreditAccount(userId);
  await db.$transaction(run);
}

/**
 * A paid plan payment (upgrade or renewal invoice): the plan's monthly credits are filled now, once per Paystack
 * reference. They refill each month after that and never pile up. Returns the plan credits now available.
 */
export async function grantPlanCredits(userId: string, planCode: string | null | undefined, reference: string) {
  if (!planCode) return 0;
  await ensureCreditAccount(userId);
  try {
    await db.aiCreditPurchase.create({
      data: { reference: `${CREDIT_REFERENCE_PREFIX}plan-${reference}`, userId, packId: `plan:${planCode}`, credits: 0, amountKobo: 0, status: "paid", paidAt: new Date() },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return 0;
    throw error;
  }
  const plan = await planCreditsFor(userId);
  const account = await db.$transaction(async (tx) => {
    const now = await settle(tx, userId, plan);
    // A renewal paid mid-month tops the plan's credits back up to the month's amount.
    if (now.planCredits >= plan.monthly) return now;
    return tx.aiCreditAccount.update({ where: { userId }, data: { planCredits: plan.monthly } });
  });
  return account.planCredits;
}

/** Starts a Paystack checkout for a pack; returns the page to send the seller to. */
export async function startCreditCheckout(input: { user: { id: string; email: string | null }; packId: string; autoTopUp: boolean; origin: string; returnTo: string }) {
  const pack = creditPack(input.packId, (await liveCreditPrices()).packs);
  if (!pack) throw new CreditError("Choose one of the credit packs.");
  const reference = `${CREDIT_REFERENCE_PREFIX}${crypto.randomUUID()}`;
  await db.aiCreditPurchase.create({ data: { reference, userId: input.user.id, packId: pack.id, credits: pack.credits, amountKobo: packKobo(pack), saveCard: input.autoTopUp } });
  const callbackUrl = new URL("/api/app/credits/callback", input.origin);
  callbackUrl.searchParams.set("returnTo", input.returnTo);
  const session = await initializePaystackTransaction({
    email: billingEmail(input.user),
    amountKobo: packKobo(pack),
    reference,
    callbackUrl: callbackUrl.toString(),
    metadata: { purpose: "ai_credits", user_id: input.user.id, pack_id: pack.id, credits: pack.credits, auto_top_up: input.autoTopUp },
  });
  return { authorizationUrl: session.authorization_url, reference };
}

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

/**
 * Credits a verified purchase once. Safe to call from the callback and the webhook at the same time. Returns
 * "paid" when the credits are (now or already) in, "failed" when Paystack says it didn't go through.
 */
export async function completeCreditPurchase(reference: string): Promise<"paid" | "failed" | "pending"> {
  const row = await db.aiCreditPurchase.findUnique({ where: { reference } });
  if (!row) throw new CreditError("We couldn't find that credit purchase.");
  if (row.status === "paid") return "paid";
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") {
    if (verified.status === "failed" || verified.status === "abandoned" || verified.status === "reversed") {
      await db.aiCreditPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: `Paystack: ${verified.status}` } });
      return "failed";
    }
    return "pending";
  }
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true } });
  const metadata = (verified.metadata ?? {}) as Record<string, unknown>;
  const customer = verified.customer?.email?.toLowerCase() ?? null;
  if (
    !user ||
    verified.currency !== "NGN" ||
    Number(verified.amount) !== row.amountKobo ||
    metadata.purpose !== "ai_credits" ||
    metadata.user_id !== row.userId ||
    customer !== billingEmail(user)
  ) {
    await db.aiCreditPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: "Payment details didn't match" } });
    throw new CreditError("That payment doesn't match this credit purchase. Contact support if you were charged.");
  }
  const card = row.saveCard ? savedAuthorization(verified.authorization, customer) : null;
  await ensureCreditAccount(row.userId);
  await db.$transaction(async (tx) => {
    const moved = await tx.aiCreditPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "paid", paidAt: new Date(), error: null } });
    if (moved.count !== 1) return;
    const remember = card?.reusable ? { authorization: asJson(card), autoTopUp: true, autoPackId: row.packId } : {};
    if (Object.keys(remember).length) await tx.aiCreditAccount.update({ where: { userId: row.userId }, data: remember });
    await addCredits(row.userId, row.credits, "purchase", reference, tx);
  });
  return "paid";
}

/** Turns auto top-up on or off, or changes its pack. Turning it on needs a card saved from a purchase. */
export async function setAutoTopUp(userId: string, input: { enabled: boolean; packId?: string | null }) {
  const [account, { packs }] = await Promise.all([db.aiCreditAccount.findUnique({ where: { userId } }), liveCreditPrices()]);
  const pack = input.packId === undefined ? creditPack(account?.autoPackId, packs) ?? creditPack(DEFAULT_AUTO_PACK, packs) : creditPack(input.packId, packs);
  if (!pack) throw new CreditError("Choose one of the credit packs.");
  if (input.enabled && !readSavedAuthorization(account?.authorization)) {
    throw new CreditError("Buy a pack with “Top me up automatically” ticked first, so we can save your card.");
  }
  await ensureCreditAccount(userId);
  return db.aiCreditAccount.update({ where: { userId }, data: { autoTopUp: input.enabled, autoPackId: pack.id } });
}

/** Removes the saved card (auto top-up goes off). */
export async function forgetCreditCard(userId: string) {
  await db.aiCreditAccount.updateMany({ where: { userId }, data: { authorization: Prisma.DbNull, autoTopUp: false } });
}

/** Charges the saved card for the auto top-up pack. True when the credits went in. */
async function autoTopUp(userId: string, need: number, have: number): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [account, autoChargesToday, user, { packs }] = await Promise.all([
    db.aiCreditAccount.findUnique({ where: { userId } }),
    db.aiCreditPurchase.count({ where: { userId, auto: true, createdAt: { gte: since } } }),
    db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }),
    liveCreditPrices(),
  ]);
  const card = readSavedAuthorization(account?.authorization);
  if (!account || !card || !user) return false;
  if (!shouldAutoTopUp({ autoTopUp: account.autoTopUp, hasCard: card.reusable, packId: account.autoPackId, need, balance: have, autoChargesToday, packs })) return false;
  // Two requests landing together must not charge twice: one automatic charge a minute at most.
  const recent = await db.aiCreditPurchase.count({ where: { userId, auto: true, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recent > 0) return false;
  const pack = creditPack(account.autoPackId, packs)!;
  const reference = `${CREDIT_REFERENCE_PREFIX}auto-${crypto.randomUUID()}`;
  await db.aiCreditPurchase.create({ data: { reference, userId, packId: pack.id, credits: pack.credits, amountKobo: packKobo(pack), auto: true } });
  try {
    const charge = await chargePaystackAuthorization({
      email: card.email ?? billingEmail(user),
      amountKobo: packKobo(pack),
      authorizationCode: card.authorization_code,
      reference,
      metadata: { purpose: "ai_credits", user_id: userId, pack_id: pack.id, credits: pack.credits, auto_top_up: true },
    });
    if (charge.status !== "success") {
      await db.aiCreditPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: charge.message ?? charge.status ?? "declined" } });
      // A declined card stops auto top-up until the seller buys again, so it isn't retried on every request.
      if (charge.status === "failed") await db.aiCreditAccount.update({ where: { userId }, data: { autoTopUp: false } });
      return false;
    }
    return (await completeCreditPurchase(reference)) === "paid";
  } catch (error) {
    console.error("[ai/credits] auto top-up failed", error);
    await db.aiCreditPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: "Charge error" } }).catch(() => undefined);
    return false;
  }
}

/**
 * Takes `cost` credits when the plan's credits and bought credits cover it (plan credits first, then the lot that
 * expires soonest), topping up from the saved card first when auto top-up is on. Returns what's left, or null when
 * there weren't enough credits. Never goes below zero.
 */
export async function spendCredits(userId: string, cost: number): Promise<number | null> {
  const amount = Math.max(0, Math.round(cost));
  await ensureCreditAccount(userId);
  const plan = await planCreditsFor(userId);
  const take = () =>
    db.$transaction(async (tx) => {
      const account = await settle(tx, userId, plan);
      if (account.planCredits + account.balance < amount) return null;
      const fromPlan = Math.min(account.planCredits, amount);
      let rest = amount - fromPlan;
      const lots = rest > 0 ? await tx.aiCreditLot.findMany({ where: { userId, credits: { gt: 0 }, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" } }) : [];
      for (const lot of lots) {
        if (rest <= 0) break;
        const used = Math.min(lot.credits, rest);
        await tx.aiCreditLot.update({ where: { id: lot.id }, data: { credits: { decrement: used } } });
        rest -= used;
      }
      const after = await tx.aiCreditAccount.update({
        where: { userId },
        data: { planCredits: { decrement: fromPlan }, balance: { decrement: amount - fromPlan } },
      });
      return after.planCredits + after.balance;
    });
  let left = await take();
  if (left === null) {
    const have = await creditBalance(userId);
    if (await autoTopUp(userId, amount, have)) left = await take();
  }
  return left;
}

/** Buys a credit pack with the prepaid wallet balance (src/lib/wallet/balance.server.ts): no card needed. */
export async function buyCreditsFromWallet(userId: string, packId: string) {
  const pack = creditPack(packId, (await liveCreditPrices()).packs);
  if (!pack) throw new CreditError("Choose one of the credit packs.");
  const { spendFromWallet, WalletBalanceError } = await import("@/lib/wallet/balance.server");
  const reference = `${CREDIT_REFERENCE_PREFIX}wallet-${crypto.randomUUID()}`;
  await ensureCreditAccount(userId);
  try {
    await db.$transaction(async (tx) => {
      await spendFromWallet(userId, { amountKobo: packKobo(pack), reference: `wspend_${reference}`, description: `${pack.credits} AI credits` }, tx);
      await tx.aiCreditPurchase.create({ data: { reference, userId, packId: pack.id, credits: pack.credits, amountKobo: packKobo(pack), status: "paid", paidAt: new Date() } });
      await addCredits(userId, pack.credits, "purchase", reference, tx);
    });
  } catch (error) {
    if (error instanceof WalletBalanceError) throw new CreditError(error.message);
    throw error;
  }
  return { credits: pack.credits };
}
