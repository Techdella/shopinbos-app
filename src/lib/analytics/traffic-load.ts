import "server-only";

import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { lagosDayKey, type ResolvedRange } from "./range";
import { computeTraffic, type TrafficReport, type TrafficRow } from "./traffic";

// Loads what computeTraffic needs for one store and range: the StoreTrafficDaily rows (indexed on storeId + day),
// the product funnel counters from StoreMetricDaily, and paid online orders. Until the StoreTrafficDaily table
// exists (docs/migrations/2026-11-03-store-traffic-connections.sql) the report is empty rather than broken.

const ROW_LIMIT = 200_000;

export async function loadTraffic(storeId: string, range: ResolvedRange, now = new Date()): Promise<{ report: TrafficReport; available: boolean }> {
  const fromDay = lagosDayKey(range.previous.start);
  const toDay = range.toDay;
  const [traffic, since, funnelRows, orders, products] = await Promise.all([
    db.storeTrafficDaily
      .findMany({ where: { storeId, day: { gte: fromDay, lte: toDay } }, select: { day: true, metric: true, dim: true, value: true, count: true }, take: ROW_LIMIT })
      .then((rows) => ({ rows: rows as TrafficRow[], available: true }))
      .catch((error) => {
        console.error("[traffic] table unavailable", error);
        return { rows: [] as TrafficRow[], available: false };
      }),
    db.storeTrafficDaily
      .findFirst({ where: { storeId }, orderBy: { day: "asc" }, select: { day: true } })
      .then((row) => row?.day ?? null)
      .catch(() => null),
    db.storeMetricDaily
      .findMany({ where: { storeId, day: { gte: fromDay, lte: toDay }, metric: { in: ["product_view", "add_to_cart", "checkout_start"] } }, select: { day: true, metric: true, productId: true, count: true } })
      .catch(() => [] as Array<{ day: string; metric: string; productId: string; count: number }>),
    db.retailOrder.findMany({
      where: { storeId, createdAt: { gte: range.previous.start, lt: range.end }, status: { in: [...PAID_ORDER_STATUSES] }, OR: [{ channel: null }, { channel: { not: "in_person" } }] },
      select: { createdAt: true, items: true },
      take: 20_000,
    }),
    db.storeProduct.findMany({ where: { storeId }, select: { id: true, name: true, images: true }, take: 5000 }),
  ]);
  const report = computeTraffic({
    range,
    now,
    rows: traffic.rows,
    funnelRows,
    orders,
    products: products.map((product) => ({ id: product.id, name: product.name, image: product.images[0] ?? null })),
    since,
  });
  return { report, available: traffic.available };
}
