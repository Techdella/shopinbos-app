import "server-only";
import type { Prisma } from "@prisma/client";
import { holdTotals, variantHoldTotals, type StockHold, type VariantHold } from "@/lib/commerce/stock-holds";
import { adjustVariantStock, normalizeVariants } from "@shared/product-variants";

// Taking and giving back the stock an order holds (see stock-holds.ts). Always inside a transaction, with
// conditional decrements, so two shoppers can't buy the last unit and an expiry can't double-restore.
// Untracked products (hold mode "off") only count the sale; tracked ones that keep selling at 0 ("oversell") take
// their count below 0 and their versions down to 0. Preorders ("preorder") take no stock: each unit takes a place
// under the product's cap (preorderTaken, checked against preorderLimit when one is set).

export class InsufficientStockError extends Error {
  constructor(name: string) {
    super(`Insufficient stock for ${name}`);
  }
}

/**
 * Takes (negative) or gives back (positive) per-version stock inside the product's versions JSON. The row is locked
 * first, so two checkouts can't both take the last unit of one size. Products that keep selling at 0 (`oversell`)
 * give what their versions have left; the units actually taken come back per product and version.
 */
async function changeVariantStock(tx: Prisma.TransactionClient, holds: StockHold[], sign: -1 | 1, oversell = new Set<string>()) {
  const taken = new Map<string, Map<string, number>>();
  for (const [productId, variants] of variantHoldTotals(holds)) {
    await tx.$queryRaw`SELECT id FROM "StoreProduct" WHERE id = ${productId} FOR UPDATE`;
    const row = await tx.storeProduct.findUnique({ where: { id: productId }, select: { variants: true } });
    if (!row) continue;
    let wanted = [...variants.values()];
    if (sign < 0 && oversell.has(productId)) {
      const left = new Map(normalizeVariants(row.variants).map((variant) => [variant.id, variant.stock] as const));
      wanted = wanted.map((variant) => ({ ...variant, quantity: Math.min(variant.quantity, Math.max(0, left.get(variant.id) ?? 0)) }));
    }
    const result = adjustVariantStock(row.variants, wanted.map((variant) => ({ id: variant.id, delta: sign * variant.quantity })));
    if (!result.ok) {
      if (sign < 0) throw new InsufficientStockError(result.name);
      continue;
    }
    taken.set(productId, new Map(wanted.map((variant) => [variant.id, variant.quantity])));
    await tx.storeProduct.update({ where: { id: productId }, data: { variants: result.variants as Prisma.InputJsonValue } });
  }
  return taken;
}

/**
 * Takes the stock for `holds` or throws InsufficientStockError (roll the transaction back). Returns the holds as
 * taken (versions of products that keep selling at 0 may give less than asked): save these on the order, so giving
 * the stock back returns exactly what was taken.
 */
export async function reserveStock(tx: Prisma.TransactionClient, storeId: string, holds: StockHold[]): Promise<StockHold[]> {
  const totals = holdTotals(holds);
  const oversell = new Set<string>();
  for (const [productId, { quantity, names, mode }] of totals.store) {
    if (mode === "preorder") {
      const updated = await tx.$executeRaw`
        UPDATE "StoreProduct"
        SET "preorderTaken" = "preorderTaken" + ${quantity}, "soldStock" = "soldStock" + ${quantity}, "updatedAt" = NOW()
        WHERE id = ${productId} AND "storeId" = ${storeId} AND status = 'published' AND "preorderEnabled" = true
          AND ("preorderLimit" IS NULL OR "preorderTaken" + ${quantity} <= "preorderLimit")`;
      if (updated !== 1) throw new InsufficientStockError(names.join(", "));
      continue;
    }
    if (mode === "off") {
      // Not tracked: only the sale counts.
      const updated = await tx.storeProduct.updateMany({ where: { id: productId, storeId, status: "published" }, data: { soldStock: { increment: quantity } } });
      if (updated.count !== 1) throw new InsufficientStockError(names.join(", "));
      continue;
    }
    if (mode === "oversell") {
      oversell.add(productId);
      const updated = await tx.storeProduct.updateMany({
        where: { id: productId, storeId, status: "published" },
        data: { currentStock: { decrement: quantity }, soldStock: { increment: quantity } },
      });
      if (updated.count !== 1) throw new InsufficientStockError(names.join(", "));
      continue;
    }
    // Tracked: only what isn't set aside (reservedStock) can be sold.
    const updated = await tx.$executeRaw`
      UPDATE "StoreProduct"
      SET "currentStock" = "currentStock" - ${quantity}, "soldStock" = "soldStock" + ${quantity}, "updatedAt" = NOW()
      WHERE id = ${productId} AND "storeId" = ${storeId} AND status = 'published'
        AND "currentStock" - GREATEST("reservedStock", 0) >= ${quantity}`;
    if (updated !== 1) throw new InsufficientStockError(names.join(", "));
  }
  // Sizes / colours counted on their own also give their units.
  const variantsTaken = await changeVariantStock(tx, holds, -1, oversell);
  for (const [supplierProductId, { quantity, names }] of totals.supplier) {
    const updated = await tx.supplierProduct.updateMany({
      where: { id: supplierProductId, status: "published", stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (updated.count !== 1) throw new InsufficientStockError(names.join(", "));
  }
  // Dropship lines still count as the seller's sales.
  for (const hold of holds) {
    if (hold.source !== "supplier") continue;
    const updated = await tx.storeProduct.updateMany({
      where: { id: hold.productId, storeId, status: "published" },
      data: { soldStock: { increment: hold.quantity } },
    });
    if (updated.count !== 1) throw new InsufficientStockError(hold.name);
  }
  return holdsAsTaken(holds, variantsTaken, oversell);
}

/** The holds with each oversold version's quantity set to what was really taken (versions that gave none dropped). */
function holdsAsTaken(holds: StockHold[], taken: Map<string, Map<string, number>>, oversell: Set<string>): StockHold[] {
  return holds.map((hold) => {
    if (hold.source !== "store" || !hold.variants?.length || !oversell.has(hold.productId)) return hold;
    const left = new Map(taken.get(hold.productId) ?? []);
    const variants: VariantHold[] = [];
    for (const variant of hold.variants) {
      const available = left.get(variant.id) ?? 0;
      const quantity = Math.min(variant.quantity, available);
      left.set(variant.id, available - quantity);
      if (quantity > 0) variants.push({ ...variant, quantity });
    }
    const { variants: _variants, ...rest } = hold;
    void _variants;
    return variants.length ? { ...rest, variants } : rest;
  });
}

/** Gives back what `reserveStock` took (never below zero sold). */
export async function releaseStock(tx: Prisma.TransactionClient, holds: StockHold[]) {
  const totals = holdTotals(holds);
  for (const [productId, { quantity, mode }] of totals.store) {
    if (mode === "preorder") await tx.storeProduct.updateMany({ where: { id: productId, preorderTaken: { gte: quantity } }, data: { preorderTaken: { decrement: quantity } } });
    else if (mode !== "off") await tx.storeProduct.updateMany({ where: { id: productId }, data: { currentStock: { increment: quantity } } });
    await tx.storeProduct.updateMany({ where: { id: productId, soldStock: { gte: quantity } }, data: { soldStock: { decrement: quantity } } });
  }
  await changeVariantStock(tx, holds, 1);
  for (const [supplierProductId, { quantity }] of totals.supplier) {
    await tx.supplierProduct.updateMany({ where: { id: supplierProductId }, data: { stockQuantity: { increment: quantity } } });
  }
  for (const hold of holds) {
    if (hold.source !== "supplier") continue;
    await tx.storeProduct.updateMany({ where: { id: hold.productId, soldStock: { gte: hold.quantity } }, data: { soldStock: { decrement: hold.quantity } } });
  }
}
