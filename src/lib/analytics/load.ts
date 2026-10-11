import "server-only";

import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { computeAnalytics, FUNNEL_METRICS, type AnalyticsReport, type FunnelMetric, type MetricRow } from "./compute";
import { lagosDayKey, type ResolvedRange } from "./range";

// Loads the rows computeAnalytics needs for one store and range. Storefront counters live in StoreMetricDaily
// (docs/migrations/2026-10-12-analytics-social.sql); until that table exists the report still works from orders.

const ORDER_LIMIT = 20_000;

async function loadMetrics(storeId: string, fromDay: string, toDay: string) {
  try {
    const [rows, firsts] = await Promise.all([
      db.storeMetricDaily.findMany({
        where: { storeId, day: { gte: fromDay, lte: toDay } },
        select: { day: true, metric: true, channel: true, campaign: true, productId: true, count: true },
      }),
      db.storeMetricDaily.groupBy({ by: ["metric"], where: { storeId }, _min: { day: true } }),
    ]);
    const since: Partial<Record<FunnelMetric, string>> = {};
    for (const row of firsts) {
      if ((FUNNEL_METRICS as readonly string[]).includes(row.metric) && row._min.day) since[row.metric as FunnelMetric] = row._min.day;
    }
    return { rows: rows as MetricRow[], since, available: true };
  } catch (error) {
    console.error("[analytics] storefront counters unavailable", error);
    return { rows: [] as MetricRow[], since: {}, available: false };
  }
}

export async function loadAnalytics(storeId: string, range: ResolvedRange, now = new Date()): Promise<{ report: AnalyticsReport; countersAvailable: boolean; truncated: boolean }> {
  const from = range.previous.start;
  const [orders, paidHistory, metrics, products, campaigns, ads, affiliates] = await Promise.all([
    db.retailOrder.findMany({
      where: { storeId, createdAt: { gte: from, lt: range.end } },
      orderBy: { createdAt: "desc" },
      take: ORDER_LIMIT,
      select: {
        id: true,
        total: true,
        status: true,
        createdAt: true,
        buyerEmail: true,
        buyerPhone: true,
        channel: true,
        items: true,
        discountCode: true,
        discountAmount: true,
        campaignToken: true,
        affiliateId: true,
        adCampaignId: true,
      },
    }),
    db.retailOrder.findMany({
      where: { storeId, status: { in: [...PAID_ORDER_STATUSES] }, createdAt: { lt: range.end } },
      select: { buyerEmail: true, buyerPhone: true, createdAt: true },
      take: 100_000,
    }),
    loadMetrics(storeId, lagosDayKey(from), range.toDay),
    db.storeProduct.findMany({ where: { storeId }, select: { id: true, name: true, images: true }, take: 5000 }),
    db.broadcastCampaign.findMany({ where: { storeId }, select: { id: true, name: true } }),
    db.adCampaign.findMany({ where: { storeId }, select: { id: true, headline: true, platform: true, spend: true, clicks: true } }),
    db.affiliate.findMany({ where: { storeId }, select: { id: true, name: true, code: true } }),
  ]);

  const tokens = [...new Set(orders.map((order) => order.campaignToken).filter((token): token is string => Boolean(token)))];
  const campaignTokens = tokens.length
    ? await db.campaignRecipient.findMany({ where: { storeId, token: { in: tokens } }, select: { token: true, campaignId: true } })
    : [];

  const report = computeAnalytics({
    range,
    now,
    orders: orders.map((order) => ({ ...order, total: Number(order.total), discountAmount: order.discountAmount == null ? null : Number(order.discountAmount) })),
    paidHistory,
    metrics: metrics.rows,
    metricSince: metrics.since,
    products: products.map((product) => ({ id: product.id, name: product.name, image: product.images[0] ?? null })),
    campaigns,
    campaignTokens,
    ads,
    affiliates,
  });
  return { report, countersAvailable: metrics.available, truncated: orders.length >= ORDER_LIMIT };
}
