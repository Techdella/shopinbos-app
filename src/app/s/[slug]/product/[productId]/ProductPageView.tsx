import type { Metadata } from "next";
import { BoutiqueProductPage } from "@/components/storefront/boutique/BoutiqueProductPage";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { boutiqueSnapshotFor, classicSnapshotFor, type ProductPageData } from "@/lib/storefront/product-page.server";
import { classicLook } from "@/components/storefront/boutique/pdp/classic-look";
import { classicBuyNowOnly, classicCartButtonLabel, classicPdpSettingsForSnapshot } from "@/components/storefront/boutique/pdp/classic-pdp";
import type { ThemeTokenSet } from "@/lib/store-templates";
import { resolveThemeTokens } from "@/lib/store-templates/themes";
import { ProductDetailClient } from "./ProductDetailClient";
import { scriptSafeJson } from "@/lib/security/html";
import { normalizeVariants, priceRange } from "@shared/product-variants";
import { listingSoldOut } from "@shared/product-stock";
import { NOINDEX_NOFOLLOW, type RobotsMeta } from "@/lib/seo/indexing";
import { shippingForStructuredData } from "@/lib/seo/store-seo.server";
import { breadcrumbLd, conditionFromLabel, faqPageLd, plainDescription, productLd, type JsonLd, type ProductAvailability } from "@/lib/seo/structured-data";
import { readFaqs } from "@/components/storefront/boutique/pdp/pdp-logic";
import { deliveryLines, formatStoreMoney, freeDeliveryPromise } from "@/lib/storefront/shopper-info";

// Shared by /s/[slug]/product/[productId] and custom-domain product pages.

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A description for search results: the seller's short description, else the long one, else a plain sentence. */
function productSummary(data: ProductPageData) {
  const { product, store } = data;
  const text = plainDescription(product.description, 300) || plainDescription(product.longDescription, 300);
  if (text) return text;
  const price = formatStoreMoney(product.retailPrice, product.currency);
  return `${product.name}${product.category?.name ? ` (${product.category.name})` : ""} for ${price} at ${store.name}. Order online for delivery.`;
}

export function productMetadata(data: ProductPageData | null, canonical: string, robots?: RobotsMeta): Metadata {
  if (!data) return { title: "Product not found", robots: NOINDEX_NOFOLLOW };
  const { product, store } = data;
  const title = `${product.name} | ${store.name}`;
  const description = productSummary(data);
  const image = product.images[0] ?? store.logoUrl ?? null;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    ...(robots ? { robots } : {}),
    openGraph: { title, description, url: canonical, siteName: store.name, type: "website", images: image ? product.images.slice(0, 4).map((url) => ({ url, alt: product.name })) : [] },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : [] },
  };
}

/** Same scheme as the store home's canonical: the seller's own domain, else the store's subdomain or /s/[slug]. */
export function canonicalProductUrl(data: ProductPageData, customDomain?: string | null) {
  return buildStorefrontUrl({ slug: data.store.slug, customDomain: customDomain ?? data.store.customDomain ?? null }, `/product/${encodeURIComponent(data.product.id)}`);
}

function availabilityOf(data: ProductPageData): ProductAvailability {
  const { product } = data;
  const variants = normalizeVariants(product.variants).filter((variant) => variant.enabled);
  const tracked = variants.filter((variant) => variant.stock !== null);
  if (listingSoldOut(product)) return "OutOfStock";
  const versionsLeft = tracked.length ? tracked.some((variant) => (variant.stock ?? 0) > 0) : true;
  // Tracked stock at 0 that keeps selling is a back order: it ships when more arrives.
  if (product.stock && product.stock.left <= 0 && product.stock.continueSelling) return "BackOrder";
  if (!versionsLeft) return product.stock?.continueSelling ? "BackOrder" : "OutOfStock";
  return "InStock";
}

const AVAILABILITY_TEXT: Record<ProductAvailability, string> = { InStock: "In stock", OutOfStock: "Sold out", BackOrder: "Available to order (ships when back in stock)", PreOrder: "Available to pre-order", LimitedAvailability: "Limited stock" };

function productStructuredData(data: ProductPageData, url: string) {
  const { product, store } = data;
  const variants = normalizeVariants(product.variants).filter((variant) => variant.enabled);
  const range = priceRange(variants, product.retailPrice);
  const details = record(product.productDetails);
  const home = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null });
  const shop = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null }, "/shop");
  const shipping = shippingForStructuredData(data.shopper, store.country, product.currency);
  return [
    productLd({
      url,
      name: product.name,
      description: product.longDescription || product.description,
      images: product.images,
      sku: product.sku,
      barcode: product.barcode,
      brand: typeof details.brand === "string" && details.brand.trim() ? details.brand : store.name,
      category: product.category?.name,
      currency: product.currency,
      price: { min: range.min, max: range.max },
      offerCount: variants.length || 1,
      availability: availabilityOf(data),
      condition: conditionFromLabel(details.condition),
      seller: { name: store.name, url: home },
      shipping,
      // Returns need a return window the store states as data; until there is one, none is claimed.
      returns: null,
      rating: data.reviewCount > 0 ? { average: data.avgRating, count: data.reviewCount } : null,
      reviews: data.reviews.map((review) => ({ author: review.buyerName, rating: review.rating, date: review.createdAt, title: review.title, body: review.body })),
    }),
    breadcrumbLd([
      { name: store.name, url: home },
      ...(product.category ? [{ name: product.category.name, url: `${shop}?category=${encodeURIComponent(product.category.slug)}` }] : [{ name: "Shop", url: shop }]),
      { name: product.name, url },
    ]),
    faqPageLd(readFaqs(product.faqs), url),
  ].filter((entry): entry is JsonLd => Boolean(entry));
}

/**
 * The product's key facts as plain text right at the top of the page's HTML (price, availability, delivery,
 * returns), for crawlers and AI assistants that read the HTML without running scripts, and for screen readers.
 * The visible page shows the same facts in the theme's own layout.
 */
function ProductKeyFacts({ data }: { data: ProductPageData }) {
  const { product, store } = data;
  const variants = normalizeVariants(product.variants).filter((variant) => variant.enabled);
  const range = priceRange(variants, product.retailPrice);
  const price = range.max > range.min ? `${formatStoreMoney(range.min, product.currency)} to ${formatStoreMoney(range.max, product.currency)}` : formatStoreMoney(range.min, product.currency);
  const delivery = deliveryLines(data.shopper, product.currency).map((line) => `${line.place}: ${line.detail}`).join("; ");
  const freeDelivery = freeDeliveryPromise(data.shopper.delivery);
  const returns = plainDescription(product.returnPolicy, 300);
  const summary = plainDescription(product.description, 400);
  return (
    <section className="sr-only" aria-label={`${product.name} key facts`}>
      <p>
        {product.name} from {store.name}. Price: {price}. Availability: {AVAILABILITY_TEXT[availabilityOf(data)]}.
        {product.category?.name ? ` Category: ${product.category.name}.` : ""}
        {data.reviewCount > 0 ? ` Rated ${data.avgRating} out of 5 from ${data.reviewCount} review${data.reviewCount === 1 ? "" : "s"}.` : ""}
      </p>
      {summary ? <p>{summary}</p> : null}
      {delivery || freeDelivery ? <p>Delivery: {[delivery, freeDelivery].filter(Boolean).join(". ")}.</p> : null}
      {data.shopper.payOnDelivery ? <p>Pay on delivery available.</p> : null}
      {returns ? <p>Returns: {returns}</p> : null}
    </section>
  );
}

export function ProductPageView({ data, storeBasePath, canonical }: { data: ProductPageData; storeBasePath: string; canonical: string }) {
  const jsonLd = (
    <>
      <ProductKeyFacts data={data} />
      {productStructuredData(data, canonical).map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: scriptSafeJson(entry) }}
        />
      ))}
    </>
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

  // Classic templates render the same product page as the 2026 themes, in the classic theme's colours and fonts, with
  // the product page settings from the store's published snapshot.
  const brandSettings = record(data.store.brandSettings);
  const snapshot = classicSnapshotFor(data.store.brandSettings);
  const cartConfig = brandSettings.cartConfig;
  const pdpSettings = classicPdpSettingsForSnapshot(snapshot, { addToBagFallback: classicCartButtonLabel(cartConfig) });
  const look = classicLook(snapshot?.templateId ?? "", snapshot?.themeTokens ?? fallbackTokens(brandSettings.palette));

  return (
    <>
      {jsonLd}
      <ProductDetailClient
        store={{ ...data.store, brandSettings }}
        product={data.product}
        reviews={data.reviews}
        avgRating={data.avgRating}
        reviewCount={data.reviewCount}
        storeBasePath={storeBasePath}
        catalog={data.catalog}
        related={data.related}
        shopper={data.shopper}
        settings={pdpSettings}
        look={look}
        buyNowOnly={classicBuyNowOnly(cartConfig)}
      />
    </>
  );
}

/** Colours for a classic store with no template on record: its saved palette (older stores), else the default theme. */
function fallbackTokens(palette: unknown): ThemeTokenSet {
  const own = record(palette);
  const pick = (key: string, fallback: string) => (typeof own[key] === "string" && own[key] ? (own[key] as string) : fallback);
  const base = resolveThemeTokens("");
  return {
    ...base,
    accent: pick("accent", "#c9a96e"),
    ctaBg: pick("accent", "#c9a96e"),
    ctaText: "#FFFFFF",
    paperBg: pick("paperBg", "#faf8f5"),
    cardBg: "#FFFFFF",
    ink: pick("ink", "#0c0c0c"),
    border: pick("border", "#e8e2d9"),
  };
}
