import { NextRequest } from "next/server";
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

  const product = await cachedPublic(`products:detail:${slug}`, PUBLIC_DETAIL_TTL_S, () =>
    db.supplierProduct.findFirst({
      where: {
        slug,
        status: "published",
        supplier: {
          status: "active",
          verificationStatus: "verified",
        },
      },
      select: {
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
        pricingTiers: true,
        dropshipAvailable: true,
        bulkOrderAvailable: true,
        sampleAvailable: true,
        deliveryRegions: true,
        processingTime: true,
        trendScore: true,
        createdAt: true,
        supplier: {
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
            rating: true,
            ratingCount: true,
            trustScore: true,
            responseTimeLabel: true,
            businessType: true,
            categories: true,
          },
        },
        category: { select: { id: true, name: true, slug: true, parentId: true } },
      },
    }),
  );

  if (!product) {
    return withCors(req, apiError("NOT_FOUND", "Product not found", 404));
  }

  return withCors(req, ok(product), { cacheControl: PUBLIC_DETAIL_CACHE });
}
