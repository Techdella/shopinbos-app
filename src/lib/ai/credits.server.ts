import "server-only";

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { chargePaystackAuthorization, initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { readSavedAuthorization, savedAuthorization } from "@/lib/domains/billing-pure";
import { CREDIT_REFERENCE_PREFIX, DEFAULT_AUTO_PACK, creditCosts, creditPack, creditPacksFrom, packKobo, planCreditGrant, shouldAutoTopUp } from "@shared/ai-credits";
import { getPriceBook } from "@/lib/pricing/price-book.server";

// Buying AI credits and spending them (rules in shared/ai-credits.ts).
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
  balance: number;
  autoTopUp: boolean;
  autoPackId: string | null;
  card: { brand: string | null; last4: string | null } | null;
  purchases: Array<{ reference: string; packId: string; credits: number; naira: number; status: string; auto: boolean; createdAt: string }>;
}

/**
 * The seller's credit account, opened on first use with the welcome credits. Every balance read and write goes
 * through here, so a new account never shows 0 on one screen and 5 on another.
 */
export async function ensureCreditAccount(userId: string) {
  try {
    const existing = await db.aiCreditAccount.findUnique({ where: { userId } });
    if (existing) return existing;
    const { welcome } = await liveCreditPrices();
    return await db.aiCreditAccount.upsert({ where: { userId }, create: { userId, balance: welcome }, update: {} });
  } catch (error) {
    // Two first requests at once: the other one opened the account.
    if ((error as { code?: string }).code === "P2002") return db.aiCreditAccount.findUniqueOrThrow({ where: { userId } });
    throw error;
  }
}

export async function creditOverview(userId: string): Promise<CreditOverview> {
  const [account, purchases] = await Promise.all([
    ensureCreditAccount(userId),
    db.aiCreditPurchase.findMany({ where: { userId, status: { not: "pending" } }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const card = readSavedAuthorization(account?.authorization);
  return {
    balance: account?.balance ?? 0,
    autoTopUp: Boolean(account?.autoTopUp && card),
    autoPackId: account?.autoPackId ?? null,
    card: card ? { brand: card.brand, last4: card.last4 } : null,
    purchases: purchases.map((row) => ({ reference: row.reference, packId: row.packId, credits: row.credits, naira: row.amountKobo / 100, status: row.status, auto: row.auto, createdAt: row.createdAt.toISOString() })),
  };
}

export async function creditBalance(userId: string) {
  const account = await ensureCreditAccount(userId).catch(() => null);
  return account?.balance ?? 0;
}

/**
 * Adds a paid plan's credits to the balance, once per Paystack reference (plan upgrade payment or renewal
 * invoice). Returns the credits added (0 when this reference was already counted or the plan has none).
 */
export async function grantPlanCredits(userId: string, planCode: string | null | undefined, reference: string) {
  const grant = planCreditGrant(planCode);
  if (!grant) return 0;
  await ensureCreditAccount(userId);
  try {
    await db.$transaction([
      db.aiCreditPurchase.create({
        data: { reference: `${CREDIT_REFERENCE_PREFIX}plan-${reference}`, userId, packId: `plan:${planCode}`, credits: grant.credits, amountKobo: 0, status: "paid", paidAt: new Date() },
      }),
      db.aiCreditAccount.update({ where: { userId }, data: { balance: { increment: grant.credits } } }),
    ]);
    return grant.credits;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return 0;
    throw error;
  }
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
  const opened = await ensureCreditAccount(row.userId);
  await db.$transaction(async (tx) => {
    const moved = await tx.aiCreditPurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "paid", paidAt: new Date(), error: null } });
    if (moved.count !== 1) return;
    const remember = card?.reusable ? { authorization: asJson(card), autoTopUp: true, autoPackId: row.packId } : {};
    await tx.aiCreditAccount.upsert({
      where: { userId: row.userId },
      create: { userId: row.userId, balance: opened.balance + row.credits, ...remember },
      update: { balance: { increment: row.credits }, ...remember },
    });
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
  return db.aiCreditAccount.upsert({
    where: { userId },
    create: { userId, balance: (await liveCreditPrices()).welcome, autoTopUp: false, autoPackId: pack.id },
    update: { autoTopUp: input.enabled, autoPackId: pack.id },
  });
}

/** Removes the saved card (auto top-up goes off). */
export async function forgetCreditCard(userId: string) {
  await db.aiCreditAccount.updateMany({ where: { userId }, data: { authorization: Prisma.DbNull, autoTopUp: false } });
}

/** Charges the saved card for the auto top-up pack. True when the credits went in. */
async function autoTopUp(userId: string, need: number): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [account, autoChargesToday, user, { packs }] = await Promise.all([
    db.aiCreditAccount.findUnique({ where: { userId } }),
    db.aiCreditPurchase.count({ where: { userId, auto: true, createdAt: { gte: since } } }),
    db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }),
    liveCreditPrices(),
  ]);
  const card = readSavedAuthorization(account?.authorization);
  if (!account || !card || !user) return false;
  if (!shouldAutoTopUp({ autoTopUp: account.autoTopUp, hasCard: card.reusable, packId: account.autoPackId, need, balance: account.balance, autoChargesToday, packs })) return false;
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
 * Takes `cost` credits when the balance covers it, topping up from the saved card first when auto top-up is on.
 * Returns the balance left, or null when there weren't enough credits.
 */
export async function spendCredits(userId: string, cost: number): Promise<number | null> {
  await ensureCreditAccount(userId);
  const take = () => db.aiCreditAccount.updateMany({ where: { userId, balance: { gte: cost } }, data: { balance: { decrement: cost } } });
  let taken = await take();
  if (taken.count !== 1 && (await autoTopUp(userId, cost))) taken = await take();
  if (taken.count !== 1) return null;
  return creditBalance(userId);
}
