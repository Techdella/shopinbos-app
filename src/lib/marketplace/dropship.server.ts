import "server-only";
import { db } from "@/lib/db/client";
import { saleBreakdown, shipsLabel } from "./find";

// The seller's dropship products (web /home/dropship and the mobile app), and pausing / resuming one.

export async function listDropship(sellerId: string) {
  const relationships = await db.dropshipRelationship.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    take: 120,
    include: {
      supplier: { select: { id: true, userId: true, displayName: true, city: true } },
      supplierProduct: { select: { name: true, wholesalePrice: true, stockQuantity: true, processingTime: true, images: true } },
      storeProduct: { select: { id: true, name: true, status: true, images: true, retailPrice: true } },
    },
  });
  return relationships.map((r) => {
    const sale = saleBreakdown(r.storeProduct.retailPrice, r.supplierProduct.wholesalePrice);
    const paused = r.status === "paused";
    return {
      id: r.id,
      paused,
      live: !paused && r.storeProduct.status === "published",
      product: { id: r.storeProduct.id, name: r.storeProduct.name, status: r.storeProduct.status },
      image: r.storeProduct.images[0] || r.supplierProduct.images[0] || null,
      supplier: { id: r.supplier.id, userId: r.supplier.userId, name: r.supplier.displayName, city: r.supplier.city },
      ships: shipsLabel(r.supplierProduct.processingTime),
      stock: r.supplierProduct.stockQuantity,
      sale,
    };
  });
}

export type DropshipItem = Awaited<ReturnType<typeof listDropship>>[number];

/** Pausing takes the product off the store; resuming publishes it again. Null when it isn't the seller's. */
export async function setDropshipPausedFor(sellerId: string, relationshipId: string, pause: boolean) {
  const link = await db.dropshipRelationship.findUnique({ where: { id: relationshipId }, select: { id: true, sellerId: true, storeProductId: true } });
  if (!link || link.sellerId !== sellerId) return null;
  const status = pause ? "paused" : "active";
  await db.$transaction([
    db.dropshipRelationship.update({ where: { id: link.id }, data: { status } }),
    db.storeProduct.update({ where: { id: link.storeProductId }, data: { status: pause ? "draft" : "published" } }),
  ]);
  return status as "active" | "paused";
}
