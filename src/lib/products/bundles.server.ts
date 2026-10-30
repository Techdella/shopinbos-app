import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { withShortCode } from "@/lib/products/short-code.server";
import {
  BUNDLE_MAX_ITEMS,
  BUNDLE_MAX_QUANTITY,
  BUNDLE_NAME_MAX,
  BUNDLE_TAG,
  bundleAvailable,
  bundleDetails,
  bundleForShoppers,
  bundleProblemMessage,
  bundleSaving,
  checkBundle,
  isBundleProduct,
  partProblem,
  partsTotal,
  readBundle,
  type BundleItem,
  type BundleSummary,
} from "@shared/bundles";
import type { ShopperStock } from "@shared/product-stock";

// Bundles ("Buy together") for the seller's web form (/products/bundles), the phone's "Make a bundle" screen and the
// storefront's "What's inside". The rules are in shared/bundles.ts; a bundle is a StoreProduct whose productDetails
// lists its items (no table of its own). Used by /api/store/products/bundles and src/lib/storefront.

export const BundleSaveSchema = z.object({
  name: z.string().trim().min(1, "Give the bundle a name.").max(BUNDLE_NAME_MAX),
  description: z.string().trim().max(5000).optional().nullable(),
  price: z.number().positive("Set a bundle price above 0.").max(100_000_000),
  items: z.array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().min(1).max(BUNDLE_MAX_QUANTITY) })).min(1).max(BUNDLE_MAX_ITEMS * 2),
  /** The bundle's photo; empty: the first item's photo. */
  image: z.string().url().max(2000).optional().nullable().or(z.literal("")),
  publish: z.boolean().optional(),
});
export type BundleSaveInput = z.infer<typeof BundleSaveSchema>;

const partSelect = {
  id: true, storeId: true, name: true, images: true, retailPrice: true, costPrice: true, status: true, productDetails: true,
  fulfillmentType: true, supplierProductId: true, variants: true, preorderEnabled: true,
  trackStock: true, currentStock: true, reservedStock: true,
} as const;

export class BundleSaveError extends Error {}

/** A bundle as the seller's pages list it: its items with names and prices now, the saving and how many can sell. */
export interface SellerBundle {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  status: string;
  soldCount: number;
  items: Array<{ productId: string; quantity: number; name: string; image: string | null; price: number; missing: boolean }>;
  partsTotal: number;
  saving: { amount: number; percent: number };
  /** Bundles that can be bought now; null when no item tracks stock. */
  available: number | null;
}

/** The store's products a bundle can hold: its own, not archived, no versions, pre-orders or other bundles. */
export async function bundleChoices(storeId: string) {
  const rows = await db.storeProduct.findMany({ where: { storeId, status: { not: "archived" } }, select: partSelect, orderBy: { createdAt: "desc" }, take: 500 });
  return rows
    .filter((row) => !partProblem(row))
    .map((row) => ({
      id: row.id,
      name: row.name,
      images: row.images,
      retailPrice: row.retailPrice,
      status: row.status,
      // Units left when the seller counts stock (null: not counted).
      stock: row.trackStock ? row.currentStock - Math.max(0, row.reservedStock) : null,
    }));
}

/** The store's bundles (not archived), newest first, or one by id. */
export async function sellerBundles(storeId: string, onlyId?: string): Promise<SellerBundle[]> {
  const rows = await db.storeProduct.findMany({
    where: { storeId, status: { not: "archived" }, ...(onlyId ? { id: onlyId } : { tags: { has: BUNDLE_TAG } }) },
    select: { id: true, name: true, description: true, images: true, retailPrice: true, status: true, soldStock: true, productDetails: true },
    orderBy: { createdAt: "desc" },
  });
  const bundles = rows.flatMap((row) => {
    const items = readBundle(row.productDetails);
    return items ? [{ row, items }] : [];
  });
  const ids = [...new Set(bundles.flatMap((bundle) => bundle.items.map((item) => item.productId)))];
  const parts = ids.length ? await db.storeProduct.findMany({ where: { storeId, id: { in: ids } }, select: partSelect }) : [];
  const byId = new Map(parts.map((part) => [part.id, part]));
  return bundles.map(({ row, items }) => {
    const total = partsTotal(items, (id) => byId.get(id)?.retailPrice);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      image: row.images[0] ?? null,
      price: row.retailPrice,
      status: row.status,
      soldCount: row.soldStock,
      items: items.map((item) => {
        const part = byId.get(item.productId);
        return { productId: item.productId, quantity: item.quantity, name: part?.name ?? "", image: part?.images[0] ?? null, price: part?.retailPrice ?? 0, missing: !part || part.status === "archived" };
      }),
      partsTotal: total,
      saving: bundleSaving(total, row.retailPrice),
      available: bundleAvailable(items, (id) => byId.get(id)),
    };
  });
}

/** Makes (no `id`) or changes a bundle. Throws BundleSaveError with words for the seller when it can't be saved. */
export async function saveBundle(store: { id: string; userId: string }, input: BundleSaveInput, id?: string) {
  const existing = id ? await db.storeProduct.findFirst({ where: { id, storeId: store.id }, select: { id: true, productDetails: true, tags: true, status: true, visibility: true } }) : null;
  if (id && (!existing || !isBundleProduct(existing))) throw new BundleSaveError("That bundle is no longer in your store.");
  const parts = await db.storeProduct.findMany({ where: { storeId: store.id, id: { in: input.items.map((item) => item.productId) } }, select: partSelect });
  const check = checkBundle({ storeId: store.id, name: input.name, price: input.price, items: input.items, selfId: id ?? null }, parts);
  if (!check.ok) throw new BundleSaveError(bundleProblemMessage(check.problem, check.product));
  const items: BundleItem[] = check.items;
  const byId = new Map(parts.map((part) => [part.id, part]));
  const total = partsTotal(items, (partId) => byId.get(partId)?.retailPrice);
  // Cost: the items' costs when every one has one (the margin then reads right on the product list).
  const costs = items.map((item) => byId.get(item.productId)?.costPrice);
  const costPrice = costs.every((cost) => typeof cost === "number") ? Math.round(items.reduce((sum, item, index) => sum + (costs[index] as number) * item.quantity, 0) * 100) / 100 : null;
  const image = input.image || byId.get(items[0]!.productId)?.images[0] || null;
  const publish = input.publish ?? (existing ? existing.status === "published" : true);
  const data = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    images: image ? [image] : [],
    retailPrice: input.price,
    // The parts' total shows struck through on cards and the product page when the bundle saves the shopper money.
    compareAtPrice: total > input.price ? total : null,
    costPrice,
    margin: costPrice !== null ? parseFloat((((input.price - costPrice) / input.price) * 100).toFixed(2)) : null,
    // Its items hold the stock (shared/bundles.ts).
    trackStock: false,
    continueSellingWhenOut: false,
    preorderEnabled: false,
    status: publish ? "published" : "draft",
    visibility: publish ? ("storefront" as const) : existing?.visibility ?? ("hidden" as const),
    productDetails: bundleDetails(existing?.productDetails, items) as Prisma.InputJsonValue,
  };
  let saved: { id: string };
  if (existing) {
    saved = await db.storeProduct.update({ where: { id: existing.id }, data: { ...data, tags: [...new Set([...existing.tags, BUNDLE_TAG])] }, select: { id: true } });
  } else {
    saved = await withShortCode(store.id, { name: data.name }, (shortCode) =>
      db.storeProduct.create({
        data: {
          ...data,
          shortCode,
          storeId: store.id,
          userId: store.userId,
          currentStock: 0,
          tags: [BUNDLE_TAG],
        },
        select: { id: true },
      }),
    );
  }
  await markCatalogDirty(store.id);
  return (await sellerBundles(store.id, saved.id))[0]!;
}

// ─── Storefront ───────────────────────────────────────────────────────────────

/** "What's inside" and the stock of a bundle on its product page (null for other products). */
export async function bundleForProductPage(storeId: string, product: { retailPrice: number; productDetails?: unknown }, statuses: readonly string[]): Promise<{ summary: BundleSummary; stock: ShopperStock | null } | null> {
  const items = readBundle(product.productDetails);
  if (!items) return null;
  const rows = await db.storeProduct.findMany({
    where: { storeId, id: { in: items.map((item) => item.productId) }, status: { in: [...statuses] } },
    select: { id: true, name: true, images: true, retailPrice: true, trackStock: true, currentStock: true, reservedStock: true, preorderEnabled: true, fulfillmentType: true },
  });
  return bundleForShoppers(items, product.retailPrice, rows);
}
