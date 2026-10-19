import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/client";
import { hasPublishedStorefront } from "./store-visibility";
import type { StoreBrand } from "./public-store.server";

/**
 * Whether the store is live (open and published): only live stores count visits, so the owner's preview and the
 * "not open yet" page are never counted. Uses the brand the layout already loaded; only a store published as
 * builder pages (no editor snapshot) needs one small count.
 */
export const storeIsLive = cache(async (brand: StoreBrand | null): Promise<boolean> => {
  if (!brand?.active) return false;
  if (hasPublishedStorefront(brand.brandSettings, 0)) return true;
  const pages = await db.storePage.count({ where: { storeId: brand.id, isPublished: true } }).catch(() => 0);
  return pages > 0;
});
