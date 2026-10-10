import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";

function hasPublishedStorefront(brandSettings: unknown, publishedPageCount: number) {
  if (publishedPageCount > 0) return true;
  if (!brandSettings || typeof brandSettings !== "object" || Array.isArray(brandSettings)) return false;
  const editor = (brandSettings as Record<string, unknown>).editor;
  return Boolean(
    editor &&
    typeof editor === "object" &&
    !Array.isArray(editor) &&
    (editor as Record<string, unknown>).published,
  );
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const store = await db.store.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      country: true,
      city: true,
      currency: true,
      brandSettings: true,
      customDomain: true,
      status: true,
      storeProducts: {
        where: { status: "published" },
        select: {
          id: true,
          name: true,
          description: true,
          sku: true,
          images: true,
          retailPrice: true,
          currency: true,
          fulfillmentType: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
          variants: true,
          supplierProduct: {
            select: { stockQuantity: true, moq: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      pages: {
        where: { isPublished: true },
        select: {
          id: true,
          type: true,
          title: true,
          slug: true,
          content: true,
          publishedContent: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404));
  if (store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not available", 404));
  if (!hasPublishedStorefront(store.brandSettings, store.pages.length)) {
    return withCors(req, apiError("NOT_FOUND", "Store not published", 404));
  }

  const productIds = store.storeProducts.map((p) => p.id);
  let reviewMap: Map<string, { avgRating: number; count: number }> = new Map();
  if (productIds.length > 0) {
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",");
    try {
      const reviewStats = await db.$queryRawUnsafe<Array<{ productId: string; avg: number; count: bigint }>>(
        `SELECT "productId", AVG(rating)::float AS avg, COUNT(*)::bigint AS count FROM "ProductReview" WHERE "productId" = ANY(ARRAY[${placeholders}]) AND status = 'approved' GROUP BY "productId"`,
        ...productIds,
      );
      for (const r of reviewStats) {
        reviewMap.set(r.productId, { avgRating: Math.round(r.avg * 10) / 10, count: Number(r.count) });
      }
    } catch { /* review table may not exist yet */ }
  }

  const enrichedProducts = store.storeProducts.map((p) => {
    const review = reviewMap.get(p.id);
    return {
      ...p,
      avgRating: review?.avgRating ?? 0,
      reviewCount: review?.count ?? 0,
    };
  });

  return withCors(req, ok({ ...store, storeProducts: enrichedProducts }));
}
