import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { VISIBLE_SUPPLIER } from "@/lib/marketplace/agreements.server";

// The phone's Find products rows: the same fields the public products API gives (apps/mobile/src/lib/marketplace.ts
// RawProduct), from suppliers sellers can see (verified or not), plus what the seller needs to judge the supplier.

export const productSelect = {
  id: true, name: true, slug: true, description: true, images: true, wholesalePrice: true, suggestedRetailPrice: true, moq: true,
  stockQuantity: true, pricingTiers: true, dropshipAvailable: true, bulkOrderAvailable: true, processingTime: true, trendScore: true,
  category: { select: { name: true } },
  supplier: { select: { id: true, displayName: true, slug: true, city: true, address: true, rating: true, ratingCount: true, description: true, responseTimeLabel: true, verificationStatus: true, returnPolicy: true } },
} as const satisfies Prisma.SupplierProductSelect;

export const productWhere = (country: string): Prisma.SupplierProductWhereInput => ({ status: "published", supplier: { ...VISIBLE_SUPPLIER, country: { equals: country, mode: "insensitive" } } });

export async function sellerStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, city: true, country: true } });
}
