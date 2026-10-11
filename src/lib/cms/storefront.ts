import "server-only";

import type { Metadata } from "next";
import { cache, type CSSProperties } from "react";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { BQ_GROTESK, BQ_SERIF } from "@/components/storefront/boutique/fonts";
import { buildStorefrontUrl, normalizeDomain } from "@/lib/domains/storefront";
import { docProductIds, type ProductCardData, type RichDoc } from "@/lib/cms/richtext";
import type { CmsField, RichValue } from "@/lib/cms/fields";
import { db } from "@/lib/db/client";
import { loadReferences, loadStorefrontCollection, loadStorefrontItem, readSeoMeta, type PublicStore } from "@/lib/cms/server";
import { normalizeSeo, seoMetadata } from "@/lib/seo/fields";
import { naira } from "@shared/onboarding";

/** Loaded once per request (metadata and page share it). */
export const storefrontCollection = cache(loadStorefrontCollection);
export const storefrontItem = cache(loadStorefrontItem);

// What the storefront CMS pages need besides the data: the store's theme as CSS variables, canonical
// URLs (app path or the seller's own domain), and Next metadata from each item's SEO tab.

export interface CmsTheme {
  vars: CSSProperties;
  headingFont: string;
  dark: boolean;
}

export function cmsTheme(store: Pick<PublicStore, "brandSettings" | "status">): CmsTheme {
  const look = readStoreLook(store);
  const tokens = look.snapshot?.themeTokens ?? look.tokens;
  const ink = toHex6(tokens?.ink, "#16141F");
  const paper = toHex6(tokens?.paperBg, "#FFFFFF");
  const accent = toHex6(tokens?.accent, "#E8590C");
  const cta = toHex6(tokens?.ctaBg, ink);
  const ctaText = toHex6(tokens?.ctaText, "#FFFFFF");
  const card = toHex6(tokens?.cardBg, "#F6F4F9");
  const border = toHex6(tokens?.border, "#E7E4EF");
  const muted = toHex6(tokens?.muted, "#5D5A6B");
  const radius = tokens?.radius === "sharp" ? "4px" : tokens?.radius === "rounded" ? "22px" : "14px";
  const headingFont = tokens?.headingStyle === "serif" ? BQ_SERIF : BQ_GROTESK;
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  return {
    headingFont,
    dark: luminance(paper) < 0.4,
    vars: {
      ["--cms-ink" as string]: ink,
      ["--cms-paper" as string]: paper,
      ["--cms-accent" as string]: accent,
      ["--cms-cta" as string]: cta,
      ["--cms-cta-text" as string]: ctaText,
      ["--cms-accent-text" as string]: ctaText,
      ["--cms-soft" as string]: card,
      ["--cms-border" as string]: border,
      ["--cms-muted" as string]: muted,
      ["--cms-radius" as string]: radius,
      ["--cms-heading-font" as string]: headingFont,
      background: paper,
      color: ink,
    },
  };
}

/** Canonical address of a storefront path: the app's /s/[slug]/… or the seller's own domain. */
export function cmsCanonical(storeSlug: string, path: string, customDomain?: string | null) {
  if (customDomain) return buildStorefrontUrl({ slug: storeSlug, customDomain: normalizeDomain(customDomain) }, path);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com";
  return `${appUrl.replace(/\/$/, "")}/s/${storeSlug}${path}`;
}

export function storeLink(basePath: string, path: string) {
  return `${basePath}${path}` || "/";
}

export async function collectionMetadata(storeSlug: string, collectionSlug: string, customDomain?: string | null): Promise<Metadata> {
  const found = await storefrontCollection(storeSlug, collectionSlug);
  if (!found) return { title: "Not found" };
  const { store, collection, items } = found;
  return seoMetadata(normalizeSeo(collection.seo), {
    title: collection.name,
    titleSuffix: store.name,
    description: collection.description || `${collection.name} from ${store.name}`,
    image: items.find((item) => item.featuredImage)?.featuredImage ?? store.logoUrl,
    canonical: cmsCanonical(store.slug, `/${collection.slug}`, customDomain),
    siteName: store.name,
  }) as Metadata;
}

export async function itemMetadata(storeSlug: string, collectionSlug: string, itemSlug: string, customDomain?: string | null): Promise<Metadata> {
  const found = await storefrontItem(storeSlug, collectionSlug, itemSlug);
  if (!found) return { title: "Not found" };
  const { store, collection, item } = found;
  const meta = seoMetadata(normalizeSeo(item.seo), {
    title: item.title,
    titleSuffix: store.name,
    description: item.excerpt,
    image: item.featuredImage ?? store.logoUrl,
    canonical: cmsCanonical(store.slug, `/${collection.slug}/${item.slug}`, customDomain),
    siteName: store.name,
    type: collection.template === "blog" ? "article" : "website",
  });
  if (collection.template === "blog") {
    return { ...meta, openGraph: { ...meta.openGraph, type: "article", publishedTime: item.publishedAt?.toISOString(), modifiedTime: item.updatedAt.toISOString(), authors: item.author ? [item.author] : undefined } } as Metadata;
  }
  return meta as Metadata;
}

/** Products (for cards and product fields) and linked items an item needs, keyed by id. */
export async function itemReferences(storeId: string, fields: CmsField[], data: Record<string, unknown>, basePath: string) {
  const productIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const field of fields) {
    const value = data[field.key];
    if (field.type === "products" && Array.isArray(value)) value.forEach((id) => productIds.add(String(id)));
    if (field.type === "items" && Array.isArray(value)) value.forEach((id) => itemIds.add(String(id)));
    if (field.type === "richText") docProductIds(((value as RichValue | undefined)?.json ?? { type: "doc", content: [] }) as RichDoc).forEach((id) => productIds.add(id));
  }
  const refs = await loadReferences(storeId, [...productIds], [...itemIds]);
  const products: Record<string, ProductCardData> = {};
  for (const product of refs.products) {
    products[product.id] = { name: product.name, href: storeLink(basePath, `/product/${product.id}`), image: product.images[0] ?? null, price: product.currency === "NGN" ? naira(product.retailPrice) : `${product.currency} ${product.retailPrice.toLocaleString()}` };
  }
  const items: Record<string, { title: string; href: string; image: string | null }> = {};
  for (const item of refs.items) items[item.id] = { title: item.title, href: storeLink(basePath, `/${item.collection.slug}/${item.slug}`), image: item.featuredImage };
  return { products, items };
}

// ─── Product collections (/collections/<slug>) ───────────────────────────────

export const storefrontProductCollection = cache(async (storeSlug: string, handle: string) => {
  const store = await db.store.findUnique({ where: { slug: storeSlug }, select: { id: true, name: true, slug: true, description: true, logoUrl: true, currency: true, customDomain: true, brandSettings: true, status: true } });
  if (!store || store.status !== "active") return null;
  const collection = await db.collection.findUnique({
    where: { storeId_slug: { storeId: store.id, slug: handle } },
    select: { id: true, name: true, slug: true, description: true, imageUrl: true, products: { orderBy: { sortOrder: "asc" }, take: 200, select: { product: { select: { id: true, name: true, images: true, retailPrice: true, compareAtPrice: true, currency: true, status: true } } } } },
  });
  if (!collection) return null;
  const seo = await readSeoMeta(store.id, "collection", collection.id);
  const products = collection.products.map((row) => row.product).filter((product) => product.status === "published");
  return { store, collection, products, seo };
});

export async function productCollectionMetadata(storeSlug: string, handle: string, customDomain?: string | null): Promise<Metadata> {
  const found = await storefrontProductCollection(storeSlug, handle);
  if (!found) return { title: "Not found" };
  const { store, collection, products, seo } = found;
  return seoMetadata(seo, {
    title: collection.name,
    titleSuffix: store.name,
    description: collection.description || `Shop ${collection.name} at ${store.name}`,
    image: collection.imageUrl ?? products[0]?.images[0] ?? store.logoUrl,
    canonical: cmsCanonical(store.slug, `/collections/${collection.slug}`, customDomain),
    siteName: store.name,
  }) as Metadata;
}

// ─── Products ────────────────────────────────────────────────────────────────

/**
 * The product page's metadata with the product's SEO tab applied on top (search title/description from the
 * product row, share card, canonical and noindex from SeoMeta). Falls back to `base` for anything unset.
 */
export async function withProductSeo(base: Metadata, productId: string | null | undefined): Promise<Metadata> {
  if (!productId) return base;
  const product = await db.storeProduct.findUnique({ where: { id: productId }, select: { storeId: true, seoTitle: true, seoDescription: true } }).catch(() => null);
  if (!product) return base;
  const stored = await readSeoMeta(product.storeId, "product", productId);
  const seo = { ...stored, metaTitle: product.seoTitle?.trim() || stored.metaTitle, metaDescription: product.seoDescription?.trim() || stored.metaDescription };
  if (!seo.metaTitle && !seo.metaDescription && !seo.socialImage && !seo.socialTitle && !seo.socialDescription && !seo.canonicalUrl && !seo.noIndex) return base;
  const og = (base.openGraph ?? {}) as Record<string, unknown>;
  const tw = (base.twitter ?? {}) as Record<string, unknown>;
  const title = seo.metaTitle || (typeof base.title === "object" && base.title && "absolute" in base.title ? String(base.title.absolute) : String(base.title ?? ""));
  const description = seo.metaDescription || base.description || "";
  const socialTitle = seo.socialTitle || title;
  const socialDescription = seo.socialDescription || description;
  const images = seo.socialImage ? [{ url: seo.socialImage, alt: socialTitle }] : og.images;
  return {
    ...base,
    title: { absolute: title },
    description,
    alternates: seo.canonicalUrl ? { ...base.alternates, canonical: seo.canonicalUrl } : base.alternates,
    ...(seo.noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { ...og, title: socialTitle, description: socialDescription, images } as Metadata["openGraph"],
    twitter: { ...tw, title: socialTitle, description: socialDescription, ...(seo.socialImage ? { images: [seo.socialImage], card: "summary_large_image" } : {}) } as Metadata["twitter"],
  };
}
