import "server-only";
import { db } from "@/lib/db/client";
import { TYPE_PREFIX, codePrefix, isShortCodeClash, nextShortCode, nounPrefix } from "@shared/product-codes";

// Short codes for new products (BAG1, BAG2…, rules in shared/product-codes.ts). Every place that creates a
// StoreProduct goes through withShortCode: the web and phone product API, imports, Rex's store build, the
// marketplace / dropship adds and the onboarding add. Two products made at the same moment can pick the same next
// number; the unique index (storeId, shortCode) refuses the second, which then takes the following number.

export interface ShortCodeSeed {
  name: string;
  productType?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
}

const ATTEMPTS = 5;

/** The next free code in the store for this product (its prefix's highest number + 1). */
export async function nextCodeForStore(storeId: string, seed: ShortCodeSeed): Promise<string> {
  let categoryName = seed.categoryName ?? null;
  // The category only counts when neither a product word in the name nor the type gives the prefix.
  const needsCategory = !categoryName && seed.categoryId && !nounPrefix(seed.name) && !(seed.productType && TYPE_PREFIX[seed.productType]);
  if (needsCategory) {
    const category = await db.category.findUnique({ where: { id: seed.categoryId! }, select: { name: true } }).catch(() => null);
    categoryName = category?.name ?? null;
  }
  const prefix = codePrefix({ productType: seed.productType, categoryName, name: seed.name });
  const used = await db.storeProduct.findMany({ where: { storeId, shortCode: { startsWith: prefix } }, select: { shortCode: true } });
  return nextShortCode(prefix, used.map((row) => row.shortCode));
}

/**
 * Runs `create` with the product's code, trying the next number when another product took it at the same moment.
 * If no code can be worked out (or every try clashed), the product is still made, without a code.
 */
export async function withShortCode<T>(storeId: string, seed: ShortCodeSeed, create: (shortCode: string | null) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const code = await nextCodeForStore(storeId, seed).catch(() => null);
    if (!code) break;
    try {
      return await create(code);
    } catch (error) {
      if (!isShortCodeClash(error)) throw error;
    }
  }
  return create(null);
}

/** The codes of these products in the store, by id (order lines name the product by id). */
export async function shortCodesById(storeId: string, productIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = await db.storeProduct.findMany({ where: { storeId, id: { in: ids }, shortCode: { not: null } }, select: { id: true, shortCode: true } }).catch(() => []);
  return Object.fromEntries(rows.map((row) => [row.id, row.shortCode!]));
}

/** Order items with each product's code added (`shortCode`), for the order pages. */
export async function withItemCodes<I extends { productId?: unknown }>(storeId: string, items: I[]): Promise<Array<I & { shortCode?: string }>> {
  const codes = await shortCodesById(storeId, items.map((item) => (typeof item.productId === "string" ? item.productId : "")));
  return items.map((item) => {
    const code = typeof item.productId === "string" ? codes[item.productId] : undefined;
    return code ? { ...item, shortCode: code } : item;
  });
}
