import { NextRequest } from "next/server";
import { PUBLIC_PREORDER_SELECT, withPublicPreorder } from "@/lib/marketplace/public-preorder";
import { db } from "@/lib/db/client";
import { cachedPublic, PUBLIC_DETAIL_TTL_S } from "@/lib/api/public-cache";
import { PUBLIC_DETAIL_CACHE, withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const supplier = await cachedPublic(`suppliers:detail:${slug}`, PUBLIC_DETAIL_TTL_S, () =>
    db.supplier.findFirst({
      where: {
        slug,
        status: "active",
      },
      select: {
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
        products: {
          where: { status: "published" },
          orderBy: { trendScore: "desc" },
          take: 12,
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
          },
        },
        _count: { select: { products: { where: { status: "published" } } } },
      },
    }),
  );

  if (!supplier) {
    return withCors(req, apiError("NOT_FOUND", "Supplier not found", 404));
  }

  return withCors(req, ok({ ...supplier, products: supplier.products.map(withPublicPreorder) }), { cacheControl: PUBLIC_DETAIL_CACHE });
}
