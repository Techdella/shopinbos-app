import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { lagosDayKey } from "./range";
import type { TrafficIncrement } from "./traffic";

/**
 * Adds a beacon's counters to today's StoreTrafficDaily rows in one statement. Best effort, like recordStoreMetric:
 * a missing table (migration not applied yet) must never break the storefront.
 */
export async function recordTraffic(storeId: string, increments: TrafficIncrement[], now = new Date()) {
  if (!increments.length) return;
  const day = lagosDayKey(now);
  // One row per (metric, dim, value): Postgres refuses to update the same row twice in one INSERT … ON CONFLICT.
  const merged = new Map<string, TrafficIncrement>();
  for (const item of increments) {
    const key = `${item.metric}\u0000${item.dim}\u0000${item.value}`;
    const seen = merged.get(key);
    if (seen) seen.amount += item.amount;
    else merged.set(key, { ...item });
  }
  const values = [...merged.values()].map(
    (item) => Prisma.sql`(gen_random_uuid()::text, ${storeId}, ${day}, ${item.metric}, ${item.dim}, ${item.value.slice(0, 120)}, ${Math.round(item.amount)}, NOW())`,
  );
  try {
    await db.$executeRaw`
      INSERT INTO "StoreTrafficDaily" ("id", "storeId", "day", "metric", "dim", "value", "count", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("storeId", "day", "metric", "dim", "value")
      DO UPDATE SET "count" = "StoreTrafficDaily"."count" + EXCLUDED."count", "updatedAt" = NOW()
    `;
  } catch (error) {
    console.error("[traffic] could not record", error);
  }
}
