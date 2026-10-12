import "server-only";

import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { isMissingTable } from "./config.server";
import { GAME_CODE_PREFIXES } from "./logic";

// Numbers for Marketing > Rewards: plays, codes issued and used, sales from game codes, points issued and
// redeemed. `tablesReady` is false until the gamification SQL is applied (plays and points read as 0 then).

export interface GameStats {
  tablesReady: boolean;
  since: string;
  plays: { wheel: number; scratch: number; post_purchase: number };
  wins: number;
  codesIssued: number;
  codesRedeemed: number;
  revenue: number;
  discountGiven: number;
  tierOrders: number;
  tierRevenue: number;
  points: { issued: number; redeemed: number; members: number };
}

const PREFIXES = [GAME_CODE_PREFIXES.wheel, GAME_CODE_PREFIXES.scratch, GAME_CODE_PREFIXES.post_purchase].map((prefix) => `${prefix}-`);

export async function gameStats(storeId: string, days = 30): Promise<GameStats> {
  const since = new Date(Date.now() - days * 86_400_000);
  const codeFilter = { OR: PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })) };
  const [codesIssued, codesRedeemed, sales, tierSales] = await Promise.all([
    db.discount.count({ where: { storeId, createdAt: { gte: since }, ...codeFilter } }),
    db.discount.count({ where: { storeId, createdAt: { gte: since }, usedCount: { gt: 0 }, ...codeFilter } }),
    db.retailOrder.aggregate({
      where: { storeId, createdAt: { gte: since }, status: { in: [...PAID_ORDER_STATUSES] }, OR: PREFIXES.map((prefix) => ({ discountCode: { startsWith: prefix } })) },
      _sum: { total: true, discountAmount: true },
    }),
    db.retailOrder.aggregate({
      where: { storeId, createdAt: { gte: since }, status: { in: [...PAID_ORDER_STATUSES] }, discountCode: { startsWith: `${GAME_CODE_PREFIXES.tier}-` } },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  const stats: GameStats = {
    tablesReady: true,
    since: since.toISOString(),
    plays: { wheel: 0, scratch: 0, post_purchase: 0 },
    wins: 0,
    codesIssued,
    codesRedeemed,
    revenue: sales._sum.total ?? 0,
    discountGiven: sales._sum.discountAmount ?? 0,
    tierOrders: tierSales._count,
    tierRevenue: tierSales._sum.total ?? 0,
    points: { issued: 0, redeemed: 0, members: 0 },
  };

  try {
    const [plays, wins, issued, redeemed, members] = await Promise.all([
      db.gamePlay.groupBy({ by: ["game"], where: { storeId, createdAt: { gte: since } }, _count: true }),
      db.gamePlay.count({ where: { storeId, createdAt: { gte: since }, code: { not: null } } }),
      db.loyaltyLedger.aggregate({ where: { storeId, createdAt: { gte: since }, kind: { in: ["earn", "reverse"] } }, _sum: { points: true } }),
      db.loyaltyLedger.aggregate({ where: { storeId, createdAt: { gte: since }, kind: { in: ["redeem", "refund"] } }, _sum: { points: true } }),
      db.loyaltyAccount.count({ where: { storeId } }),
    ]);
    for (const row of plays) {
      if (row.game === "wheel" || row.game === "scratch" || row.game === "post_purchase") stats.plays[row.game] = row._count;
    }
    stats.wins = wins;
    stats.points = { issued: Math.max(0, issued._sum.points ?? 0), redeemed: Math.max(0, -(redeemed._sum.points ?? 0)), members };
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    stats.tablesReady = false;
    stats.wins = codesIssued;
  }
  return stats;
}
