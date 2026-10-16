import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/client";
import { readIntegrations, type StoreIntegrations } from "./integrations";
import { hasPublishedStorefront } from "./store-visibility";
import type { StoreBrand } from "./public-store.server";

/**
 * The store's connections when the store is live (open and published), else null: the owner's preview and the
 * "not open yet" page never load anyone's tracking. Uses the brand the layout already loaded; only a store
 * published as builder pages (no editor snapshot) needs one small count.
 */
export const liveStoreIntegrations = cache(async (brand: StoreBrand | null): Promise<StoreIntegrations | null> => {
  if (!brand?.active) return null;
  let live = hasPublishedStorefront(brand.brandSettings, 0);
  if (!live) {
    const pages = await db.storePage.count({ where: { storeId: brand.id, isPublished: true } }).catch(() => 0);
    live = pages > 0;
  }
  return live ? readIntegrations(brand.brandSettings) : null;
});
