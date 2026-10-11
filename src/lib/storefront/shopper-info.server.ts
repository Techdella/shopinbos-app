import "server-only";
import { db } from "@/lib/db/client";
import { buildShopperInfo, type ShopperReviewHighlight, type StorefrontShopperInfo, EMPTY_SHOPPER_INFO } from "./shopper-info";

/**
 * Loads the seller settings a shopper sees around the products (delivery zones, payment choices, WhatsApp,
 * collections, real review highlights). Each query fails soft: a missing table must not take a storefront down.
 */
export async function loadShopperInfo(
  storeId: string,
  brandSettings: unknown,
  products: Array<{ id: string; avgRating?: number | null; reviewCount?: number | null }> = [],
): Promise<StorefrontShopperInfo> {
  try {
    const [zones, liveChat, collections, reviews] = await Promise.all([
      db.shippingZone
        .findMany({ where: { storeId, active: true }, orderBy: { sortOrder: "asc" }, select: { name: true, type: true, regions: true, rates: true } })
        .catch(() => []),
      db.liveChatConfig.findUnique({ where: { storeId }, select: { whatsappNumber: true } }).catch(() => null),
      db.collection
        .findMany({
          where: { storeId },
          orderBy: { sortOrder: "asc" },
          take: 12,
          select: { id: true, name: true, slug: true, imageUrl: true, products: { select: { productId: true }, orderBy: { sortOrder: "asc" }, take: 60 } },
        })
        .catch(() => []),
      db
        .$queryRawUnsafe<Array<{ id: string; buyerName: string; rating: number; body: string; title: string; productName: string | null }>>(
          `SELECT r.id, r."buyerName", r.rating, r.body, r.title, p.name AS "productName"
           FROM "ProductReview" r LEFT JOIN "StoreProduct" p ON p.id = r."productId"
           WHERE r."storeId" = $1 AND r.status = 'approved' AND r.rating >= 4 AND (COALESCE(r.body, '') <> '' OR COALESCE(r.title, '') <> '')
           ORDER BY r."createdAt" DESC LIMIT 6`,
          storeId,
        )
        .catch(() => []),
    ]);

    let count = 0;
    let sum = 0;
    for (const product of products) {
      if ((product.reviewCount ?? 0) > 0 && (product.avgRating ?? 0) > 0) {
        count += product.reviewCount!;
        sum += product.avgRating! * product.reviewCount!;
      }
    }

    const highlights: ShopperReviewHighlight[] = reviews.map((review) => ({
      id: review.id,
      buyerName: firstNameOnly(review.buyerName),
      rating: review.rating,
      body: (review.body || review.title || "").trim().slice(0, 240),
      productName: review.productName,
    }));

    return buildShopperInfo({
      brandSettings,
      zones,
      whatsappNumber: liveChat?.whatsappNumber ?? null,
      collections: collections
        .map((collection) => ({
          id: collection.id,
          name: collection.name,
          slug: collection.slug,
          imageUrl: collection.imageUrl,
          productIds: collection.products.map((entry) => entry.productId),
        }))
        .filter((collection) => collection.productIds.length > 0),
      rating: count > 0 ? { average: Math.round((sum / count) * 10) / 10, count } : null,
      reviews: highlights,
    });
  } catch {
    return EMPTY_SHOPPER_INFO;
  }
}

/** Reviews show "Kemi O." rather than a buyer's full name. */
function firstNameOnly(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.` : parts[0]!;
}
