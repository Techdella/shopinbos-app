import { NextRequest } from "next/server";
import { PUBLIC_PREORDER_SELECT, withPublicPreorder } from "@/lib/marketplace/public-preorder";
import { db } from "@/lib/db/client";
import { cachedPublic, publicCacheKey, PUBLIC_LIST_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_LIST_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { okList, apiError, parsePagination, parseSort, sortToOrderBy } from "@/lib/api/response";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ categorySlug: string }> }
) {
  const { categorySlug } = await params;
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePagination(sp);
  const orderBy = sortToOrderBy(parseSort(sp));

  const result = await cachedPublic(
    publicCacheKey("products:category", { categorySlug, page, limit, orderBy }),
    PUBLIC_LIST_TTL_S,
    async () => {
      const category = await db.category.findUnique({ where: { slug: categorySlug } });
      if (!category) return null;

      const where = {
        status: "published" as const,
        categoryId: category.id,
        supplier: {
          status: "active" as const,
          verificationStatus: "verified" as const,
        },
      };

      const [total, products] = await Promise.all([
        db.supplierProduct.count({ where }),
        db.supplierProduct.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          select: {
            id: true,
            name: true,
            slug: true,
            images: true,
            wholesalePrice: true,
            suggestedRetailPrice: true,
            currency: true,
            moq: true,
            dropshipAvailable: true,
            trendScore: true,
            ...PUBLIC_PREORDER_SELECT,
            supplier: {
              select: { id: true, displayName: true, slug: true, country: true, rating: true, logoUrl: true },
            },
          },
        }).then((rows) => rows.map(withPublicPreorder)),
      ]);

      return { total, products };
    },
  );
  if (!result) {
    return withCors(req, apiError("NOT_FOUND", "Category not found", 404));
  }
  const { total, products } = result;

  return withCors(req, okList(products, { page, limit, total }), { cacheControl: PUBLIC_LIST_CACHE });
}
