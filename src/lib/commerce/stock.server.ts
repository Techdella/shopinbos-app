import "server-only";
import type { Prisma } from "@prisma/client";
import { holdTotals, type StockHold } from "@/lib/commerce/stock-holds";

// Taking and giving back the stock an order holds (see stock-holds.ts). Always inside a transaction, with
// conditional decrements, so two shoppers can't buy the last unit and an expiry can't double-restore.

export class InsufficientStockError extends Error {
  constructor(name: string) {
    super(`Insufficient stock for ${name}`);
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
  for (const [supplierProductId, { quantity }] of totals.supplier) {
    await tx.supplierProduct.updateMany({ where: { id: supplierProductId }, data: { stockQuantity: { increment: quantity } } });
  }
  for (const hold of holds) {
    if (hold.source !== "supplier") continue;
    await tx.storeProduct.updateMany({ where: { id: hold.productId, soldStock: { gte: hold.quantity } }, data: { soldStock: { decrement: hold.quantity } } });
  }
}
