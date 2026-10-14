import type { Metadata } from "next";
import { BoutiqueProductPage } from "@/components/storefront/boutique/BoutiqueProductPage";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { boutiqueSnapshotFor, type ProductPageData } from "@/lib/storefront/product-page.server";
import { ProductDetailClient } from "./ProductDetailClient";
import { scriptSafeJson } from "@/lib/security/html";
import { normalizeVariants, priceRange } from "@shared/product-variants";

// Shared by /s/[slug]/product/[productId] and custom-domain product pages.

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function productMetadata(data: ProductPageData | null, canonical: string): Metadata {
  if (!data) return { title: "Product not found" };
  const { product, store } = data;
  const title = `${product.name} | ${store.name}`;
  const description = (product.description || store.description || `Shop ${product.name} at ${store.name}`).slice(0, 300);
  const image = product.images[0] ?? store.logoUrl ?? null;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: store.name, type: "website", images: image ? [{ url: image, alt: product.name }] : [] },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : [] },
  };
}

/** Same scheme as the store home's canonical: /s/[slug] on the app, or the seller's own domain. */
export function canonicalProductUrl(data: ProductPageData, customDomain?: string | null) {
  if (customDomain) return buildStorefrontUrl({ slug: data.store.slug, customDomain }, `/product/${data.product.id}`);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  return `${appUrl}/s/${data.store.slug}/product/${data.product.id}`;
}

function productJsonLd(data: ProductPageData, url: string) {
  const { product, store } = data;
  const variants = normalizeVariants(product.variants).filter((variant) => variant.enabled);
  const tracked = variants.filter((variant) => variant.stock !== null);
  const inStock = tracked.length ? tracked.some((variant) => (variant.stock ?? 0) > 0) : true;
  const range = priceRange(variants, product.retailPrice);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.length ? product.images : undefined,
    sku: product.sku ?? undefined,
    category: product.category?.name,
    ...(data.reviewCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: data.avgRating, reviewCount: data.reviewCount, bestRating: 5, worstRating: 1 } } : {}),
    ...(data.reviews.length
      ? {
          review: data.reviews.slice(0, 10).map((review) => ({
            "@type": "Review",
            author: { "@type": "Person", name: review.buyerName },
            datePublished: review.createdAt.slice(0, 10),
            reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
            ...(review.title ? { name: review.title } : {}),
            ...(review.body ? { reviewBody: review.body } : {}),
          })),
        }
      : {}),
    offers: {
      "@type": "Offer",
      price: range.min,
      ...(range.max > range.min ? { highPrice: range.max } : {}),
      priceCurrency: product.currency,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
      seller: { "@type": "Organization", name: store.name },
    },
  };
}

export function ProductPageView({ data, storeBasePath, canonical }: { data: ProductPageData; storeBasePath: string; canonical: string }) {
  const jsonLd = (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: scriptSafeJson(productJsonLd(data, canonical)) }}
    />
  );

  if (data.themeId) {
    return (
      <>
        {jsonLd}
        <BoutiqueProductPage
          themeId={data.themeId}
          snapshot={boutiqueSnapshotFor(data.themeId, data.store.brandSettings)}
          store={data.store}
          product={data.product}
          reviews={data.reviews}
          avgRating={data.avgRating}
          reviewCount={data.reviewCount}
          catalog={data.catalog}
          shopper={data.shopper}
          storeBasePath={storeBasePath}
        />
      </>
    );
  }

  return (
    <>
      {jsonLd}
      <ProductDetailClient
        store={{ ...data.store, brandSettings: record(data.store.brandSettings) }}
        product={data.product}
        reviews={data.reviews}
        avgRating={data.avgRating}
        reviewCount={data.reviewCount}
        ratingCounts={data.ratingCounts}
        storeBasePath={storeBasePath}
        catalog={data.catalog}
        related={data.related}
      />
    </>
  );
}
