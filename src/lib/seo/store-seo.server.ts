import "server-only";

import { cache } from "react";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl, normalizeDomain } from "@/lib/domains/storefront";
import { readBusinessAddress } from "@/lib/email/shell";
import { liveItemWhere } from "@/lib/cms/fields";
import { normalizeSeo } from "@/lib/seo/fields";
import { legalLinks, legalPagePath } from "@/lib/legal/pages";
import { SOCIAL_KEYS, socialUrl } from "@/lib/bio/pure";
import { loadShopperInfo } from "@/lib/storefront/shopper-info.server";
import { deliveryLines, formatStoreMoney, freeDeliveryPromise, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { storeUnavailableReason } from "@/lib/storefront/store-visibility";
import { forShoppers, listingSoldOut } from "@shared/product-stock";
import { normalizeVariants, priceRange } from "@shared/product-variants";
import { storefrontPageHref } from "@shared/storefront-pages";
import { storeHiddenFromSearch, storeIndexable } from "./indexing";
import { storeSitemapEntries, storefrontPageRefs, type SitemapEntry } from "./sitemap";
import { countryCode, storeOrganizationLd, type JsonLd, type ShippingInput } from "./structured-data";
import { storeFaqs } from "./storefront-content";
import type { LlmsInput } from "./llms";

// What search engines and AI assistants get from a store, loaded from the database: whether it may be indexed,
// its canonical addresses, the sitemap entries, the store's organisation JSON-LD and the llms.txt facts. Pages
// (storefront-route, product, CMS, legal) and the robots.txt / sitemap.xml / llms.txt handlers share it.

const searchSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoUrl: true,
  country: true,
  city: true,
  currency: true,
  customDomain: true,
  brandSettings: true,
  status: true,
  updatedAt: true,
} as const;

export type SearchStore = NonNullable<Awaited<ReturnType<typeof findSearchStore>>>;

function findSearchStore(slug: string) {
  return db.store.findUnique({ where: { slug }, select: searchSelect });
}

/** A storefront path's absolute address: the store's own domain, else its subdomain, else app /s/<slug>. */
export function storeUrl(store: { slug: string; customDomain?: string | null }, path = "/") {
  return buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ? normalizeDomain(store.customDomain) : null }, path);
}

/**
 * Whether a store may be indexed (live and not hidden by the seller), loaded once per request. Null when there's
 * no store with that slug.
 */
export const storeSearchState = cache(async (slug: string) => {
  const store = await findSearchStore(slug).catch(() => null);
  if (!store) return null;
  const published = await db.storePage.count({ where: { storeId: store.id, isPublished: true } }).catch(() => 0);
  const live = storeUnavailableReason(store, published) === null;
  return { store, live, hidden: storeHiddenFromSearch(store.brandSettings), indexable: storeIndexable(live, store.brandSettings) };
});

/** True when `url` is on the host the request came in on (the canonical host serves the file itself). */
export function onRequestHost(url: string, requestHost: string | null | undefined) {
  try {
    return new URL(url).host.toLowerCase() === String(requestHost ?? "").toLowerCase();
  } catch {
    return false;
  }
}

// ─── The store as an organisation ─────────────────────────────────────────────

/** Social profiles from the link-in-bio page (the one place sellers list them), WhatsApp left out. */
async function socialProfiles(storeId: string) {
  const bio = await db.bioPage.findUnique({ where: { storeId }, select: { published: true, blocks: true } }).catch(() => null);
  if (!bio?.published || !Array.isArray(bio.blocks)) return [];
  const out: string[] = [];
  for (const block of bio.blocks as Array<Record<string, unknown>>) {
    if (block?.type !== "socials" || !block.links || typeof block.links !== "object") continue;
    const links = block.links as Record<string, string | undefined>;
    for (const key of SOCIAL_KEYS) {
      if (key === "whatsapp") continue;
      const href = socialUrl(key, links[key]);
      if (href) out.push(href);
    }
  }
  return out;
}

/** OnlineStore (or LocalBusiness) JSON-LD for the store's home page. */
export const storeOrganizationJsonLd = cache(async (slug: string): Promise<JsonLd | null> => {
  const state = await storeSearchState(slug);
  if (!state) return null;
  const { store } = state;
  const address = readBusinessAddress(store.brandSettings);
  const sameAs = await socialProfiles(store.id);
  return storeOrganizationLd({
    name: store.name,
    url: storeUrl(store),
    logo: store.logoUrl,
    description: store.description,
    sameAs,
    email: address.email || null,
    phone: address.phone || null,
    address: address.line1 || address.city
      ? { line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country || store.country }
      : store.city
        ? { city: store.city, country: store.country }
        : null,
    currency: store.currency,
  });
});

/** Cheapest delivery the store offers (zones that deliver, else its flat rate), for Offer.shippingDetails. */
export function shippingForStructuredData(shopper: StorefrontShopperInfo | null | undefined, country: string | null | undefined, currency: string): ShippingInput | null {
  const code = countryCode(country);
  if (!shopper || !code) return null;
  const zones = shopper.delivery.filter((zone) => !zone.pickupOnly && zone.fee !== null);
  if (zones.length) {
    const cheapest = zones.reduce((best, zone) => ((zone.fee ?? Infinity) < (best.fee ?? Infinity) ? zone : best));
    return { country: code, fee: cheapest.fee ?? 0, currency, estimatedDays: cheapest.estimatedDays };
  }
  if (shopper.flatRate !== null) return { country: code, fee: shopper.flatRate, currency };
  return null;
}

// ─── Sitemap ─────────────────────────────────────────────────────────────────

/** Every indexable address of a live store (empty for stores that aren't live or are hidden). */
export async function loadStoreSitemapEntries(slug: string): Promise<SitemapEntry[]> {
  const state = await storeSearchState(slug);
  if (!state?.indexable) return [];
  const { store } = state;
  const [pages, products, collections, cms, seoRows, reviewCount] = await Promise.all([
    db.storePage.findMany({ where: { storeId: store.id, isPublished: true }, select: { type: true, slug: true, title: true, content: true, publishedContent: true, updatedAt: true } }).catch(() => []),
    db.storeProduct
      .findMany({ where: { storeId: store.id, status: "published", currency: store.currency }, select: { id: true, name: true, images: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 100_000 })
      .catch(() => []),
    db.collection
      .findMany({ where: { storeId: store.id }, select: { id: true, slug: true, imageUrl: true, updatedAt: true, _count: { select: { products: { where: { product: { status: "published" } } } } } } })
      .catch(() => []),
    db.cmsCollection
      .findMany({
        where: { storeId: store.id, isPublished: true },
        select: { slug: true, seo: true, updatedAt: true, items: { where: liveItemWhere(), select: { slug: true, featuredImage: true, updatedAt: true, seo: true }, take: 10_000 } },
      })
      .catch(() => []),
    db.seoMeta.findMany({ where: { storeId: store.id, resourceType: { in: ["product", "collection"] } }, select: { resourceType: true, resourceId: true, data: true } }).catch(() => []),
    db.productReview.count({ where: { storeId: store.id, status: "approved" } }).catch(() => 0),
  ]);
  const hidden = new Set(seoRows.filter((row) => normalizeSeo(row.data).noIndex).map((row) => `${row.resourceType}:${row.resourceId}`));
  const pageRefs = storefrontPageRefs({ pages, brandSettings: store.brandSettings });
  const policies = legalLinks(store.brandSettings);
  return storeSitemapEntries({
    url: (path) => storeUrl(store, path),
    storeUpdatedAt: store.updatedAt,
    pages: pageRefs.map((page) => ({ path: page.path, noIndex: page.noIndex })),
    products: products.map((product) => ({ ...product, noIndex: hidden.has(`product:${product.id}`) })),
    collections: collections.filter((collection) => collection._count.products > 0).map((collection) => ({ ...collection, noIndex: hidden.has(`collection:${collection.id}`) })),
    cms: cms
      // A CMS collection whose slug is also a store page is answered by the page (src/app/s/[slug]/[collection]).
      .filter((collection) => !pageRefs.some((page) => page.path === `/${collection.slug}`))
      .map((collection) => ({
        slug: collection.slug,
        updatedAt: collection.updatedAt,
        noIndex: normalizeSeo(collection.seo).noIndex,
        items: collection.items.map((item) => ({ slug: item.slug, image: item.featuredImage, updatedAt: item.updatedAt, noIndex: normalizeSeo(item.seo).noIndex })),
      })),
    extraPaths: [
      ...(policies.length ? [{ path: "/policies" }] : []),
      ...policies.map((policy) => ({ path: legalPagePath(policy.key) })),
      ...(reviewCount > 0 ? [{ path: "/reviews" }] : []),
    ],
  });
}

// ─── llms.txt ────────────────────────────────────────────────────────────────

/** The facts /llms.txt and /llms-full.txt describe a live store with; null when the store isn't indexable. */
export async function loadStoreLlms(slug: string, productLimit: number): Promise<LlmsInput | null> {
  const state = await storeSearchState(slug);
  if (!state?.indexable) return null;
  const { store } = state;
  const url = (path: string) => storeUrl(store, path);
  const [pages, products, collections, blog, rating, shopper] = await Promise.all([
    db.storePage.findMany({ where: { storeId: store.id, isPublished: true }, select: { type: true, slug: true, title: true, content: true, publishedContent: true }, orderBy: { order: "asc" } }).catch(() => []),
    db.storeProduct
      .findMany({
        where: { storeId: store.id, status: "published", currency: store.currency },
        select: {
          id: true, name: true, description: true, retailPrice: true, currency: true, variants: true, category: { select: { name: true, slug: true } },
          supplierProduct: { select: { stockQuantity: true } }, trackStock: true, continueSellingWhenOut: true, currentStock: true, reservedStock: true, lowStockThreshold: true, preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true,
        },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
        take: productLimit,
      })
      .catch(() => []),
    db.collection
      .findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" }, select: { name: true, slug: true, description: true, _count: { select: { products: { where: { product: { status: "published" } } } } } } })
      .catch(() => []),
    db.cmsItem
      .findMany({ where: { storeId: store.id, collection: { isPublished: true }, ...liveItemWhere() }, select: { title: true, slug: true, excerpt: true, collection: { select: { slug: true } } }, orderBy: { publishedAt: "desc" }, take: 50 })
      .catch(() => []),
    db.productReview.aggregate({ where: { storeId: store.id, status: "approved" }, _avg: { rating: true }, _count: { _all: true } }).catch(() => null),
    loadShopperInfo(store.id, store.brandSettings),
  ]);
  const productCount = await db.storeProduct.count({ where: { storeId: store.id, status: "published", currency: store.currency } }).catch(() => products.length);
  const pageRefs = storefrontPageRefs({ pages, brandSettings: store.brandSettings }).filter((page) => !page.noIndex);
  const categories = new Map<string, string>();
  for (const product of products) if (product.category) categories.set(product.category.slug, product.category.name);
  const address = readBusinessAddress(store.brandSettings);
  const location = [store.city, store.country].filter(Boolean).join(", ");
  const facts: string[] = [];
  const delivery = deliveryLines(shopper, store.currency);
  if (delivery.length) facts.push(`Delivery: ${delivery.map((entry) => `${entry.place} ${entry.detail}`).join("; ")}`);
  const promise = freeDeliveryPromise(shopper.delivery);
  if (promise) facts.push(promise);
  if (shopper.paymentLabels.length) facts.push(`Payment: ${shopper.paymentLabels.join(", ")}`);
  if (shopper.payOnDelivery) facts.push(`Pay on delivery available${shopper.payOnDeliveryLimit ? ` for orders up to ${formatStoreMoney(shopper.payOnDeliveryLimit, store.currency)}` : ""}`);
  const shopUrl = (category: string) => url(storefrontPageHref("", "products", new URLSearchParams({ category })) ?? "/shop");
  const llmsProducts = products.map((row) => {
    const product = forShoppers(row);
    const range = priceRange(normalizeVariants(row.variants).filter((variant) => variant.enabled), row.retailPrice);
    const price = range.max > range.min ? `from ${formatStoreMoney(range.min, row.currency)}` : formatStoreMoney(row.retailPrice, row.currency);
    return { name: row.name, url: url(`/product/${encodeURIComponent(row.id)}`), price, available: !listingSoldOut(product), category: row.category?.name ?? null, description: row.description };
  });
  const policies = legalLinks(store.brandSettings);
  return {
    name: store.name,
    url: url("/"),
    summary: store.description,
    location,
    currency: store.currency,
    pages: pageRefs.map((page) => ({ title: page.key === "home" ? "Home" : page.key === "products" ? "Shop all products" : page.title, url: url(page.path) })),
    categories: [...categories].map(([slugValue, name]) => ({ title: name, url: shopUrl(slugValue) })),
    collections: collections.filter((collection) => collection._count.products > 0).map((collection) => ({ title: collection.name, url: url(`/collections/${encodeURIComponent(collection.slug)}`), note: collection.description })),
    products: llmsProducts,
    totalProducts: Math.max(productCount, llmsProducts.length),
    policies: policies.map((policy) => ({ title: policy.title, url: url(legalPagePath(policy.key)) })),
    posts: blog.map((item) => ({ title: item.title, url: url(`/${item.collection.slug}/${item.slug}`), note: item.excerpt })),
    facts,
    faqs: storeFaqs({ pages, brandSettings: store.brandSettings }, shopper, store.currency),
    contact: { email: address.email || null, phone: address.phone || null, whatsapp: shopper.whatsappNumber, address: [address.line1, address.city, address.country].filter(Boolean).join(", ") || null },
    rating: rating && rating._count._all > 0 && rating._avg.rating ? { average: rating._avg.rating, count: rating._count._all } : null,
  };
}
