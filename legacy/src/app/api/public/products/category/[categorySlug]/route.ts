import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
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

  const category = await db.category.findUnique({ where: { slug: categorySlug } });
  if (!category) {
    return withCors(req, apiError("NOT_FOUND", "Category not found", 404));
  }

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
        supplier: {
          select: { id: true, displayName: true, slug: true, country: true, rating: true, logoUrl: true },
        },
      },
    }),
  ]);

  return withCors(req, okList(products, { page, limit, total }), { cacheControl: PUBLIC_LIST_CACHE });
}
