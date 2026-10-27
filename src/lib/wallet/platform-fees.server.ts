import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { readSplitPlan } from "./rules";
import { PLAN_TIER_KEYS, PLAN_TIERS, isPlanTier, planTierOf } from "@shared/plan-catalog";

// What Shopinbos earns on payments (Admin › Wallets › Shopinbos fees): from every paid store order split through
// Paystack, Shopinbos's fee (platformKobo: the seller's fee for their plan, plus money owed to Shopinbos taken from
// the shares) and the suppliers' marketplace commissions. Both stay in Shopinbos's Paystack balance; every other naira
// settles straight to the businesses. Also what businesses spent on Shopinbos services from their wallet balance, and
// subscription payments (PaymentReceipt: the first payment of a plan, and each renewal from invoice.update), and AI
// credit packs bought (AiCreditPurchase paid with money: by card, auto top-up or from the wallet balance).

const PAID_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;
const DAY = 24 * 60 * 60 * 1000;

export interface FeeOrder {
  id: string;
  orderNumber: string;
  store: string;
  at: string;
  totalKobo: number;
  feeKobo: number;
  commissionKobo: number;
}

export interface FeeSummary {
  periods: Array<{ key: PeriodKey; label: string; orders: number; volumeKobo: number; feeKobo: number; commissionKobo: number }>;
  latest: FeeOrder[];
  walletSpendKobo: { month: number; all: number };
  transfersInKobo: { month: number; all: number };
  credits: {
    periods: Array<{ key: PeriodKey; label: string; purchases: number; amountKobo: number; credits: number }>;
    byMethod: Array<{ method: CreditMethod; purchases: number; amountKobo: number }>;
    latest: Array<{ reference: string; who: string; email: string | null; credits: number; method: CreditMethod; at: string; amountKobo: number }>;
  };
  subscriptions: {
    periods: Array<{ key: PeriodKey; label: string; payments: number; amountKobo: number }>;
    tiers: Array<{ tier: string; label: string; role: string; payments: number; amountKobo: number; active: number }>;
    latest: Array<{ reference: string; who: string; email: string | null; plan: string; renewal: boolean; at: string; amountKobo: number }>;
  };
}

type CreditMethod = "card" | "auto" | "wallet";

type PeriodKey = "today" | "week" | "month" | "all";

const planLabel = (tier: string) => (isPlanTier(tier) ? `${PLAN_TIERS[tier].label} (${PLAN_TIERS[tier].role === "logistics_partner" ? "delivery" : PLAN_TIERS[tier].role})` : tier);

export async function platformFeeSummary(now = new Date()): Promise<FeeSummary> {
  const orders = await db.retailOrder.findMany({
    where: { status: { in: [...PAID_STATUSES] }, paymentSplit: { not: Prisma.DbNull } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { id: true, orderNumber: true, createdAt: true, paymentSplit: true, store: { select: { name: true } } },
  });
  const rows: FeeOrder[] = [];
  for (const order of orders) {
    const plan = readSplitPlan(order.paymentSplit);
    if (!plan) continue;
    const commissionKobo = plan.suppliers.reduce((sum, supplier) => sum + (supplier.commissionKobo ?? 0), 0);
    rows.push({ id: order.id, orderNumber: order.orderNumber, store: order.store.name, at: order.createdAt.toISOString(), totalKobo: plan.totalKobo, feeKobo: plan.platformKobo ?? 0, commissionKobo });
  }
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const since = { today: startOfToday.getTime(), week: now.getTime() - 7 * DAY, month: now.getTime() - 30 * DAY, all: 0 } as const;
  const labels = { today: "Today", week: "Last 7 days", month: "Last 30 days", all: "All time" } as const;
  const periods = (Object.keys(since) as Array<keyof typeof since>).map((key) => {
    const inPeriod = rows.filter((row) => Date.parse(row.at) >= since[key]);
    return {
      key,
      label: labels[key],
      orders: inPeriod.length,
      volumeKobo: inPeriod.reduce((sum, row) => sum + row.totalKobo, 0),
      feeKobo: inPeriod.reduce((sum, row) => sum + row.feeKobo, 0),
      commissionKobo: inPeriod.reduce((sum, row) => sum + row.commissionKobo, 0),
    };
  });

  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const [spendAll, spendMonth, inAll, inMonth] = await Promise.all([
    db.walletTransaction.aggregate({ where: { kind: "spend", status: "done" }, _sum: { amountKobo: true } }),
    db.walletTransaction.aggregate({ where: { kind: "spend", status: "done", createdAt: { gte: monthAgo } }, _sum: { amountKobo: true } }),
    db.walletEntry.aggregate({ where: { kind: "transfer_in" }, _sum: { amountKobo: true } }),
    db.walletEntry.aggregate({ where: { kind: "transfer_in", createdAt: { gte: monthAgo } }, _sum: { amountKobo: true } }),
  ]);
  await getPlanCatalog(); // so plan codes created from Admin › Pricing › Plans are known
  const [receipts, activePlans] = await Promise.all([
    db.paymentReceipt.findMany({
      where: { purpose: { in: [...PLAN_TIER_KEYS] } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: { reference: true, purpose: true, amount: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
    db.user.findMany({ where: { planStatus: { in: ["active", "non_renewing"] }, planCode: { not: null } }, select: { planCode: true } }),
  ]);
  const activeByTier = new Map<string, number>();
  for (const user of activePlans) {
    const tier = planTierOf(user.planCode);
    if (tier) activeByTier.set(tier, (activeByTier.get(tier) ?? 0) + 1);
  }
  const subscriptions: FeeSummary["subscriptions"] = {
    periods: (Object.keys(since) as PeriodKey[]).map((key) => {
      const inPeriod = receipts.filter((receipt) => receipt.createdAt.getTime() >= since[key]);
      return { key, label: labels[key], payments: inPeriod.length, amountKobo: Math.round(inPeriod.reduce((sum, receipt) => sum + receipt.amount * 100, 0)) };
    }),
    tiers: PLAN_TIER_KEYS.map((tier) => {
      const paid = receipts.filter((receipt) => receipt.purpose === tier);
      return { tier, label: PLAN_TIERS[tier].label, role: PLAN_TIERS[tier].role, payments: paid.length, amountKobo: Math.round(paid.reduce((sum, receipt) => sum + receipt.amount * 100, 0)), active: activeByTier.get(tier) ?? 0 };
    }).filter((row) => row.payments || row.active),
    latest: receipts.slice(0, 30).map((receipt) => ({
      reference: receipt.reference,
      who: receipt.user.name,
      email: receipt.user.email,
      plan: planLabel(receipt.purpose),
      renewal: receipt.reference.startsWith("renewal:"),
      at: receipt.createdAt.toISOString(),
      amountKobo: Math.round(receipt.amount * 100),
    })),
  };

  const purchases = await db.aiCreditPurchase.findMany({
    where: { status: "paid", amountKobo: { gt: 0 } },
    orderBy: { paidAt: "desc" },
    take: 5000,
    select: { reference: true, userId: true, credits: true, amountKobo: true, auto: true, paidAt: true, createdAt: true },
  });
  const buyers = new Map(
    (await db.user.findMany({ where: { id: { in: [...new Set(purchases.slice(0, 30).map((row) => row.userId))] } }, select: { id: true, name: true, email: true } })).map((user) => [user.id, user]),
  );
  const creditRows = purchases.map((row) => ({
    ...row,
    at: row.paidAt ?? row.createdAt,
    method: (row.reference.includes("wallet-") ? "wallet" : row.auto ? "auto" : "card") as CreditMethod,
  }));
  const credits: FeeSummary["credits"] = {
    periods: (Object.keys(since) as PeriodKey[]).map((key) => {
      const inPeriod = creditRows.filter((row) => row.at.getTime() >= since[key]);
      return {
        key,
        label: labels[key],
        purchases: inPeriod.length,
        amountKobo: inPeriod.reduce((sum, row) => sum + row.amountKobo, 0),
        credits: inPeriod.reduce((sum, row) => sum + row.credits, 0),
      };
    }),
    byMethod: (["card", "auto", "wallet"] as const).map((method) => {
      const paid = creditRows.filter((row) => row.method === method);
      return { method, purchases: paid.length, amountKobo: paid.reduce((sum, row) => sum + row.amountKobo, 0) };
    }),
    latest: creditRows.slice(0, 30).map((row) => ({
      reference: row.reference,
      who: buyers.get(row.userId)?.name ?? "Deleted account",
      email: buyers.get(row.userId)?.email ?? null,
      credits: row.credits,
      method: row.method,
      at: row.at.toISOString(),
      amountKobo: row.amountKobo,
    })),
  };

  return {
    credits,
    subscriptions,
    periods,
    latest: rows.filter((row) => row.feeKobo > 0 || row.commissionKobo > 0).slice(0, 30),
    walletSpendKobo: { month: -(spendMonth._sum.amountKobo ?? 0), all: -(spendAll._sum.amountKobo ?? 0) },
    transfersInKobo: { month: inMonth._sum.amountKobo ?? 0, all: inAll._sum.amountKobo ?? 0 },
  };
}
