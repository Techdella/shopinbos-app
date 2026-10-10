import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { PUBLIC_LIST_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { okList } from "@/lib/api/response";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "12", 10))
  );

  const products = await db.supplierProduct.findMany({
    where: {
      status: "published",
      trendScore: { gt: 0 },
      supplier: {
        status: "active",
        verificationStatus: "verified",
      },
    },
    orderBy: { trendScore: "desc" },
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
      category: { select: { id: true, name: true, slug: true } },
    },
  });

  return withCors(req, okList(products, { page: 1, limit, total: products.length }), { cacheControl: PUBLIC_LIST_CACHE });
}
