import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { ProductDetailClient } from "./ProductDetailClient";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ slug: string; productId: string }>;
}

async function ensureTable() {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProductReview" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "storeId" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "orderId" TEXT NOT NULL,
        "buyerName" TEXT NOT NULL,
        "buyerEmail" TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        title TEXT DEFAULT '',
        body TEXT DEFAULT '',
        images TEXT[] DEFAULT ARRAY[]::TEXT[],
        status TEXT DEFAULT 'pending',
        "sellerReply" TEXT DEFAULT '',
        "repliedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch { }
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, productId } = await params;

  const [store, product] = await Promise.all([
    db.store.findUnique({
      where: { slug },
      select: {
        id: true, name: true, slug: true, description: true,
        logoUrl: true, city: true, country: true, currency: true,
        brandSettings: true,
      },
    }),
    db.storeProduct.findUnique({
      where: { id: productId },
      select: {
        id: true, storeId: true, name: true, description: true, images: true,
        retailPrice: true, currency: true, sku: true,
        category: { select: { id: true, name: true, slug: true } },
        variants: true,
      },
    }),
  ]);

  if (!store || !product || product.storeId !== store.id || product.currency !== store.currency) notFound();

  await ensureTable();

  const reviews = await db.$queryRawUnsafe<Array<{
    id: string; productId: string; buyerName: string; rating: number;
    title: string; body: string; sellerReply: string; repliedAt: Date | null;
    createdAt: Date;
  }>>(
    `SELECT id, "productId", "buyerName", rating, title, body, "sellerReply", "repliedAt", "createdAt"
     FROM "ProductReview"
     WHERE "storeId" = $1 AND "productId" = $2 AND status = 'approved'
     ORDER BY "createdAt" DESC
     LIMIT 50`,
    store.id, productId,
  ).catch(() => []);

  let avgRating = 0;
  let reviewCount = 0;
  if (reviews.length > 0) {
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    avgRating = Math.round((sum / reviews.length) * 10) / 10;
    reviewCount = reviews.length;
  }

  const ratingCounts = [0, 0, 0, 0, 0];
  for (const r of reviews) {
    ratingCounts[r.rating - 1]++;
  }

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return (
    <ProductDetailClient
      store={store}
      product={product}
      reviews={reviews.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        repliedAt: r.repliedAt instanceof Date ? r.repliedAt.toISOString() : null,
      }))}
      avgRating={avgRating}
      reviewCount={reviewCount}
      ratingCounts={ratingCounts}
      storeBasePath={storeBasePath}
    />
  );
}
