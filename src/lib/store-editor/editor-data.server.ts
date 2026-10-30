import "server-only";
import { db } from "@/lib/db/client";
import { forShoppers } from "@shared/product-stock";

// The store as the builders show it: its details, its published products (as shoppers see them, with review
// averages) and its brand settings (which hold the draft and published designs). Shared by the web builder
// (GET/PATCH /api/store/editor) and the phone's store editor (/api/mobile/store-editor).

export async function getStoreEditorData(userId: string) {
  const store = await db.store.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      city: true,
      country: true,
      currency: true,
      status: true,
      customDomain: true,
      brandSettings: true,
      storeProducts: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          images: true,
          retailPrice: true,
          currency: true,
          category: { select: { id: true, name: true, slug: true } },
          // The builder's product page preview shows the real product.
          compareAtPrice: true,
          variants: true,
          variantOptions: true,
          productType: true,
          productDetails: true,
          relatedProductIds: true,
          tags: true,
          sku: true,
          longDescription: true,
          specifications: true,
          faqs: true,
          careInstructions: true,
          shippingInfo: true,
          returnPolicy: true,
          warranty: true,
          supportInfo: true,
          videoUrl: true,
          // Stock as shoppers see it (forShoppers), and the product's own page layout / sections.
          fulfillmentType: true,
          supplierProduct: { select: { stockQuantity: true, preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true } },
          trackStock: true,
          continueSellingWhenOut: true,
          currentStock: true,
          reservedStock: true,
          lowStockThreshold: true,
          preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true,
          pageLayout: true,
        },
      },
    },
  });

  if (!store) return null;

  const productIds = store.storeProducts.map((product) => product.id);
  const reviewMap = new Map<string, { avgRating: number; count: number }>();
  if (productIds.length > 0) {
    const placeholders = productIds.map((_, index) => `$${index + 1}`).join(",");
    try {
      const reviewStats = await db.$queryRawUnsafe<Array<{ productId: string; avg: number; count: bigint }>>(
        `SELECT "productId", AVG(rating)::float AS avg, COUNT(*)::bigint AS count FROM "ProductReview" WHERE "productId" = ANY(ARRAY[${placeholders}]) AND status = 'approved' GROUP BY "productId"`,
        ...productIds,
      );
      for (const review of reviewStats) {
        reviewMap.set(review.productId, { avgRating: Math.round(review.avg * 10) / 10, count: Number(review.count) });
      }
    } catch {
      // Review aggregation is optional for older local setups.
    }
  }

  return {
    ...store,
    storeProducts: store.storeProducts.map((product) => {
      const review = reviewMap.get(product.id);
      return {
        ...forShoppers(product),
        avgRating: review?.avgRating ?? 0,
        reviewCount: review?.count ?? 0,
      };
    }),
  };
}

