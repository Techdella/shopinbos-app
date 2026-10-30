import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { DISCOVER_PAGE_SIZE, areaMatches, discoverCursor, discoverEntry } from "@shared/product-videos";
import { pilotOwners } from "./pilot.server";
import { missingTable } from "./service.server";

// Plug Discover (GET /api/public/discover): active videos with "Show on Plug Discover" on, from shops where
// post_to_plug is on, newest first. Each entry carries the product (name, price, short code, link) and the shop's
// public @handle, name and link: nothing about a person, and no supplier videos (they have no shop to send a buyer to).
// Videos of products that aren't published, or of shops that aren't active, are left out.

const SCAN_ROUNDS = 4;

export async function discoverFeed(input: { area?: string | null; cursor?: { createdAt: Date; id: string } | null; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? DISCOVER_PAGE_SIZE, 1), 30);
  const out: ReturnType<typeof discoverEntry>[] = [];
  let cursor = input.cursor ?? null;
  let more = true;
  try {
    // Shops outside the pilot (or the area) are filtered after reading, so read a few batches until the page is full.
    for (let round = 0; round < SCAN_ROUNDS && out.length < limit && more; round++) {
      const where: Prisma.ProductVideoWhereInput = {
        showOnDiscover: true,
        status: "active",
        ownerKind: "store",
        storeId: { not: null },
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      };
      const batch = await db.productVideo.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit * 3 });
      more = batch.length === limit * 3;
      if (!batch.length) break;

      const storeIds = [...new Set(batch.map((row) => row.storeId!).filter(Boolean))];
      const productIds = [...new Set(batch.map((row) => row.productId))];
      const [pilot, stores, products] = await Promise.all([
        pilotOwners("store", storeIds),
        db.store.findMany({ where: { id: { in: storeIds }, status: "active" }, select: { id: true, name: true, slug: true, handle: true, customDomain: true } }),
        db.storeProduct.findMany({ where: { id: { in: productIds }, status: "published" }, select: { id: true, storeId: true, name: true, retailPrice: true, currency: true, shortCode: true } }),
      ]);
      const storeById = new Map(stores.map((store) => [store.id, store]));
      const productById = new Map(products.map((product) => [product.id, product]));
      for (const [index, row] of batch.entries()) {
        // The cursor is the last video looked at, shown or not, so the next page starts after it.
        cursor = { createdAt: row.createdAt, id: row.id };
        const store = row.storeId ? storeById.get(row.storeId) : undefined;
        const product = productById.get(row.productId);
        const shop = row.storeId ? pilot.get(row.storeId) : undefined;
        if (store && product && product.storeId === store.id && shop?.on && areaMatches(input.area, shop.place)) {
          out.push(discoverEntry(row, product, { handle: store.handle ?? null, name: store.name, url: buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null }) }));
        }
        if (out.length >= limit) {
          more = more || index < batch.length - 1;
          break;
        }
      }
    }
  } catch (error) {
    if (!missingTable(error)) throw error;
    return { videos: [], nextCursor: null };
  }
  return { videos: out, nextCursor: more && cursor ? discoverCursor(cursor) : null };
}

/** Counts a Discover play (best effort; only active Discover videos count). */
export async function countDiscoverView(id: string) {
  await db.productVideo.updateMany({ where: { id, status: "active", showOnDiscover: true }, data: { views: { increment: 1 } } }).catch(() => undefined);
}
