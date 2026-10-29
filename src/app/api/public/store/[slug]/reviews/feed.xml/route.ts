import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildProductRatingsFeed, type FeedReview } from "@/lib/reviews/pure";
import { loadReviews, productNames, reviewUrls } from "@/lib/reviews/server";

export const dynamic = "force-dynamic";

// Google Shopping product ratings feed (Product Reviews XML 2.3). Sellers submit this URL in Merchant Center
// (Growth → Manage programs → Product ratings → scheduled fetch). Only published reviews left on the store by
// buyers with an order are included; imported Google, social and marketplace reviews are not, because Google's
// product ratings policy only accepts reviews the merchant collected.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true, status: true } });
  if (!store || store.status !== "active") return new NextResponse("Not found", { status: 404 });

  const urls = reviewUrls(store);
  const reviews = (await loadReviews(store.id, { approvedOnly: true, take: 5000 })).filter((item) => item.kind === "store" && item.productId && item.rating);
  const products = await productNames(store.id, [...new Set(reviews.map((item) => item.productId!))]);
  const requested = new Set(
    (await db.reviewRequest.findMany({ where: { storeId: store.id, orderId: { in: reviews.map((item) => item.orderId!).filter(Boolean) } }, select: { orderId: true } }).catch(() => [])).map((row) => row.orderId),
  );
  const feed: FeedReview[] = [];
  for (const item of reviews) {
    const product = products.get(item.productId!);
    if (!product) continue;
    feed.push({
      id: item.id,
      authorName: item.authorName,
      createdAt: item.createdAt,
      title: item.title,
      body: item.body,
      rating: item.rating!,
      reviewUrl: urls.product(item.productId!),
      images: item.images,
      collectionMethod: item.orderId && requested.has(item.orderId) ? "post_fulfillment" : "unsolicited",
      orderId: item.orderId,
      product: { id: item.productId!, name: product.name, url: urls.product(item.productId!), sku: product.sku },
    });
  }
  const xml = buildProductRatingsFeed({ storeName: store.name, storeUrl: urls.wall, faviconUrl: store.logoUrl, reviews: feed });
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
