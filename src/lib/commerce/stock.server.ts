import "server-only";
import type { Prisma } from "@prisma/client";
import { holdTotals, variantHoldTotals, type StockHold } from "@/lib/commerce/stock-holds";
import { adjustVariantStock } from "@shared/product-variants";

// Taking and giving back the stock an order holds (see stock-holds.ts). Always inside a transaction, with
// conditional decrements, so two shoppers can't buy the last unit and an expiry can't double-restore.

export class InsufficientStockError extends Error {
  constructor(name: string) {
    super(`Insufficient stock for ${name}`);
  }
}

/**
 * Takes (negative) or gives back (positive) per-version stock inside the product's versions JSON. The row is locked
 * first, so two checkouts can't both take the last unit of one size.
 */
async function changeVariantStock(tx: Prisma.TransactionClient, holds: StockHold[], sign: -1 | 1) {
  for (const [productId, variants] of variantHoldTotals(holds)) {
    await tx.$queryRaw`SELECT id FROM "StoreProduct" WHERE id = ${productId} FOR UPDATE`;
    const row = await tx.storeProduct.findUnique({ where: { id: productId }, select: { variants: true } });
    if (!row) continue;
    const result = adjustVariantStock(row.variants, [...variants.values()].map((variant) => ({ id: variant.id, delta: sign * variant.quantity })));
    if (!result.ok) {
      if (sign < 0) throw new InsufficientStockError(result.name);
      continue;
    }
    await tx.storeProduct.update({ where: { id: productId }, data: { variants: result.variants as Prisma.InputJsonValue } });
  }
}

/** Takes the stock for `holds` or throws InsufficientStockError (roll the transaction back). */
export async function reserveStock(tx: Prisma.TransactionClient, storeId: string, holds: StockHold[]) {
  const totals = holdTotals(holds);
  for (const [productId, { quantity, names }] of totals.store) {
    const updated = await tx.storeProduct.updateMany({
      where: { id: productId, storeId, status: "published", currentStock: { gte: quantity } },
      data: { currentStock: { decrement: quantity }, soldStock: { increment: quantity } },
    });
    if (updated.count !== 1) throw new InsufficientStockError(names.join(", "));
  }
  // Sizes / colours counted on their own also give their units.
  await changeVariantStock(tx, holds, -1);
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
}

/** Gives back what `reserveStock` took (never below zero sold). */
export async function releaseStock(tx: Prisma.TransactionClient, holds: StockHold[]) {
  const totals = holdTotals(holds);
  for (const [productId, { quantity }] of totals.store) {
    await tx.storeProduct.updateMany({ where: { id: productId }, data: { currentStock: { increment: quantity } } });
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
