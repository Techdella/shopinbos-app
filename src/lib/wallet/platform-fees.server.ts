import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { readSplitPlan } from "./rules";

// What Shopinbos earns on payments (Admin › Wallets › Shopinbos fees): from every paid store order split through
// Paystack, Shopinbos's fee (platformKobo: the seller's fee for their plan, plus money owed to Shopinbos taken from
// the shares) and the suppliers' marketplace commissions. Both stay in Shopinbos's Paystack balance; every other naira
// settles straight to the businesses. Also what businesses spent on Shopinbos services from their wallet balance.

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
  periods: Array<{ key: "today" | "week" | "month" | "all"; label: string; orders: number; volumeKobo: number; feeKobo: number; commissionKobo: number }>;
  latest: FeeOrder[];
  walletSpendKobo: { month: number; all: number };
  transfersInKobo: { month: number; all: number };
}

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
  return {
    periods,
    latest: rows.filter((row) => row.feeKobo > 0 || row.commissionKobo > 0).slice(0, 30),
    walletSpendKobo: { month: -(spendMonth._sum.amountKobo ?? 0), all: -(spendAll._sum.amountKobo ?? 0) },
    transfersInKobo: { month: inMonth._sum.amountKobo ?? 0, all: inAll._sum.amountKobo ?? 0 },
  };
}
