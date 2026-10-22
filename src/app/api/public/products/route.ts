import { NextRequest } from "next/server";
import { boostedProductIds, markFeatured } from "@/lib/plans/extras.server";
import { PRODUCT_PLAN_FIRST } from "@/lib/plans/placement";
import { db } from "@/lib/db/client";
import { cachedPublic, publicCacheKey, PUBLIC_LIST_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_LIST_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { okList, apiError, sortToOrderBy } from "@/lib/api/response";
import { PublicProductsQuerySchema } from "@/lib/schemas";

const select = {
  id: true,
  name: true,
  slug: true,
  description: true,
  images: true,
  wholesalePrice: true,
  wholesalePriceTo: true,
  suggestedRetailPrice: true,
  currency: true,
  moq: true,
  stockQuantity: true,
  dropshipAvailable: true,
  bulkOrderAvailable: true,
  sampleAvailable: true,
  deliveryRegions: true,
  processingTime: true,
  trendScore: true,
  status: true,
  createdAt: true,
  supplier: {
    select: {
      id: true,
      businessName: true,
      displayName: true,
      slug: true,
      country: true,
      city: true,
      rating: true,
      trustScore: true,
      logoUrl: true,
    },
  },
  category: {
    select: { id: true, name: true, slug: true },
  },
} as const;

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const parsed = PublicProductsQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query"));
  }

  const { page, limit, sort, category, country, minPrice, maxPrice, dropship, q } = parsed.data;
  const skip = (page - 1) * limit;
  const orderBy = sort === "trending" ? [PRODUCT_PLAN_FIRST, sortToOrderBy(sort)] : sortToOrderBy(sort);
  const wholesalePrice = {
    ...(minPrice !== undefined ? { gte: minPrice } : {}),
    ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
  };

  const where = {
    status: "published" as const,
    supplier: {
      status: "active" as const,
      verificationStatus: "verified" as const,
      ...(country ? { country } : {}),
    },
    ...(category ? { category: { slug: category } } : {}),
    ...(Object.keys(wholesalePrice).length ? { wholesalePrice } : {}),
    ...(dropship === true ? { dropshipAvailable: true } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const { total, products } = await cachedPublic(publicCacheKey("products:list", parsed.data), PUBLIC_LIST_TTL_S, async () => {
    const [total, products] = await Promise.all([
      db.supplierProduct.count({ where }),
      db.supplierProduct.findMany({ where, select, orderBy, skip, take: limit }),
    ]);
    // Products boosted this week lead the default sort (src/lib/plans/extras.server.ts).
    return { total, products: sort === "trending" ? markFeatured(products, await boostedProductIds()) : products };
  });

  return withCors(req, okList(products, { page, limit, total }), { cacheControl: PUBLIC_LIST_CACHE });
}
