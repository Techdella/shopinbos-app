import { NextRequest } from "next/server";
import { SUPPLIER_PLAN_FIRST } from "@/lib/plans/placement";
import { db } from "@/lib/db/client";
import { cachedPublic, publicCacheKey, PUBLIC_LIST_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_LIST_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { okList } from "@/lib/api/response";
import { PublicSuppliersQuerySchema } from "@/lib/schemas";
import { apiError } from "@/lib/api/response";

const select = {
  id: true,
  businessName: true,
  displayName: true,
  slug: true,
  description: true,
  logoUrl: true,
  bannerUrl: true,
  country: true,
  city: true,
  businessType: true,
  categories: true,
  rating: true,
  ratingCount: true,
  trustScore: true,
  responseTimeLabel: true,
  createdAt: true,
  _count: { select: { products: { where: { status: "published" } } } },
} as const;

function supplierOrderBy(sort: "trust_score" | "rating" | "newest" | "name") {
  switch (sort) {
    case "rating":
      return { rating: "desc" as const };
    case "newest":
      return { createdAt: "desc" as const };
    case "name":
      return { displayName: "asc" as const };
    default:
      return [SUPPLIER_PLAN_FIRST, { trustScore: "desc" as const }];
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const parsed = PublicSuppliersQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query"));
  }

  const { page, limit, sort, country, city, category, businessType, q } = parsed.data;
  const skip = (page - 1) * limit;

  const where = {
    status: "active" as const,
    verificationStatus: "verified" as const,
    ...(country ? { country } : {}),
    ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    ...(businessType ? { businessType } : {}),
    ...(category ? { categories: { has: category } } : {}),
    ...(q ? {
      OR: [
        { businessName: { contains: q, mode: "insensitive" as const } },
        { displayName: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const { total, suppliers } = await cachedPublic(publicCacheKey("suppliers:list", parsed.data), PUBLIC_LIST_TTL_S, async () => {
    const [total, suppliers] = await Promise.all([
      db.supplier.count({ where }),
      db.supplier.findMany({
        where,
        select,
        orderBy: supplierOrderBy(sort),
        skip,
        take: limit,
      }),
    ]);
    return { total, suppliers };
  });

  return withCors(req, okList(suppliers, { page, limit, total }), { cacheControl: PUBLIC_LIST_CACHE });
}
