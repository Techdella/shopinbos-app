import "server-only";

import { db } from "@/lib/db/client";
import { lagosDayKey } from "./range";
import type { StoreMetric } from "./sources";

/**
 * Adds one to today's storefront counter. Best effort: a missing table (migration not applied yet) or a
 * hiccup must never break the storefront, so errors are logged and swallowed.
 */
export async function recordStoreMetric(
  storeId: string,
  metric: StoreMetric,
  dims: { channel?: string; campaign?: string; productId?: string } = {},
  now = new Date(),
) {
  const day = lagosDayKey(now);
  try {
    await db.$executeRaw`
      INSERT INTO "StoreMetricDaily" ("id", "storeId", "day", "metric", "channel", "campaign", "productId", "count", "updatedAt")
      VALUES (gen_random_uuid()::text, ${storeId}, ${day}, ${metric}, ${dims.channel ?? ""}, ${dims.campaign ?? ""}, ${dims.productId ?? ""}, 1, NOW())
      ON CONFLICT ("storeId", "day", "metric", "channel", "campaign", "productId")
      DO UPDATE SET "count" = "StoreMetricDaily"."count" + 1, "updatedAt" = NOW()
    `;
  } catch (error) {
    console.error("[analytics] could not record", metric, error);
  }
}
