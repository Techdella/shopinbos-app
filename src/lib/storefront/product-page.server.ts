import "server-only";
import { publicBrandSettings } from "@shared/public-brand-settings";
import { cache } from "react";
import { db } from "@/lib/db/client";
import {
  BOUTIQUE_TEMPLATE_MANIFESTS,
  createSnapshotFromTemplate,
  getTemplateManifest,
  isBoutiqueTheme,
  type BoutiqueThemeId,
  type StoreEditorSnapshot,
  type ThemeTokenSet,
} from "@/lib/store-templates";
import { loadShopperInfo } from "./shopper-info.server";
import type { StorefrontShopperInfo } from "./shopper-info";
import { PREVIEW_PRODUCT_STATUSES, storeUnavailableReason } from "./store-visibility";
import { relatedProducts } from "@/components/storefront/shopper/catalog";
import { forShoppers } from "@shared/product-stock";
import { withCampaignLook } from "@/lib/store-campaigns/storefront.server";

// Everything the public product page needs, shared by /s/[slug]/product/[id] and custom-domain product pages.

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The template a store's live storefront renders with: the published editor snapshot, else the chosen template. */
export function resolveStoreTemplateId(brandSettings: unknown): string | null {
  const settings = record(brandSettings);
  const published = record(record(settings.editor).published);
  if (typeof published.templateId === "string" && published.templateId) return published.templateId;
  const template = record(settings.template);
  return typeof template.templateId === "string" && template.templateId ? template.templateId : null;
}

/** The snapshot whose header, announcement and footer the 2026 product page reuses. */
export function boutiqueSnapshotFor(themeId: BoutiqueThemeId, brandSettings: unknown): StoreEditorSnapshot {
  const settings = record(brandSettings);
  const published = record(record(settings.editor).published) as unknown as StoreEditorSnapshot;
  if (published && published.templateId === themeId && Array.isArray(published.pages)) return published;
  const manifest = BOUTIQUE_TEMPLATE_MANIFESTS.find((entry) => entry.id === themeId)!;
  const snapshot = createSnapshotFromTemplate(manifest);
  const tokens = record(settings.themeTokens);
  if (Object.keys(tokens).length) snapshot.themeTokens = { ...snapshot.themeTokens, ...(tokens as Partial<ThemeTokenSet>) };
  return snapshot;
}

/**
 * The snapshot a classic (pre-2026) store's product page reads its product page settings and theme colours from: the
 * published editor snapshot, else the chosen template with the store's saved colours. Null when neither exists.
 */
export function classicSnapshotFor(brandSettings: unknown): StoreEditorSnapshot | null {
  const settings = record(brandSettings);
  const published = record(record(settings.editor).published) as unknown as StoreEditorSnapshot;
  if (published && typeof published.templateId === "string" && !isBoutiqueTheme(published.templateId) && Array.isArray(published.pages) && published.themeTokens) return published;
  const templateId = resolveStoreTemplateId(brandSettings);
  const manifest = templateId && !isBoutiqueTheme(templateId) ? getTemplateManifest(templateId) : null;
  if (!manifest) return null;
  const snapshot = createSnapshotFromTemplate(manifest);
  const tokens = record(settings.themeTokens);
  if (Object.keys(tokens).length) snapshot.themeTokens = { ...snapshot.themeTokens, ...(tokens as Partial<ThemeTokenSet>) };
  return snapshot;
}

async function ensureReviewTable() {
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
  } catch {
    /* table exists or the database refuses DDL; reviews then read as empty */
  }
}

const catalogSelect = {
  id: true,
  name: true,
  description: true,
  images: true,
  retailPrice: true,
  compareAtPrice: true,
  currency: true,
  category: { select: { id: true, name: true, slug: true } },
  variants: true,
  variantOptions: true,
  // For "Customers also like" when the seller picked none (same type, category or tags).
  productType: true,
  tags: true,
  supplierProduct: { select: { stockQuantity: true } },
  // Stock as shoppers see it (forShoppers turns these into `stock` and drops the raw counts).
  fulfillmentType: true,
  trackStock: true,
  continueSellingWhenOut: true,
  currentStock: true,
  reservedStock: true,
  lowStockThreshold: true,
} as const;

/**
 * preview: the owner's view of a store that isn't live (the caller checks ownership with resolveStorefront);
 * the store needn't be active and draft products show.
 */
export const loadProductPage = cache(async (slug: string, productId: string, preview = false) => {
  const statuses: readonly string[] = preview ? PREVIEW_PRODUCT_STATUSES : ["published"];
  const [store, product] = await Promise.all([
    db.store.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, description: true, logoUrl: true, city: true, country: true, currency: true, customDomain: true, brandSettings: true, status: true },
    }),
    db.storeProduct.findUnique({
      where: { id: productId },
      select: {
        ...catalogSelect,
        storeId: true,
        status: true,
        sku: true,
        barcode: true,
        longDescription: true,
        specifications: true,
        careInstructions: true,
        warranty: true,
        shippingInfo: true,
        returnPolicy: true,
        productDetails: true,
        relatedProductIds: true,
        supportInfo: true,
        faqs: true,
        videoUrl: true,
        // The seller's own layout / sections for this product (product-override.ts), when they chose any.
        pageLayout: true,
      },
    }),
  ]);

  if (!store || !product || product.storeId !== store.id || product.currency !== store.currency) return null;
  // Shoppers only see live stores and published products (drafts aren't reachable by id). "Live" is the same
  // test the storefront home and checkout use, so a store that was never published can't sell from a product link.
  if (!preview && storeUnavailableReason(store, await db.storePage.count({ where: { storeId: store.id, isPublished: true } }))) return null;
  if (!statuses.includes(product.status)) return null;

  await ensureReviewTable();
  const reviews = await db
    .$queryRawUnsafe<Array<{ id: string; productId: string; buyerName: string; rating: number; title: string; body: string; images: string[] | null; sellerReply: string; repliedAt: Date | null; createdAt: Date }>>(
      `SELECT id, "productId", "buyerName", rating, title, body, images, "sellerReply", "repliedAt", "createdAt"
       FROM "ProductReview"
       WHERE "storeId" = $1 AND "productId" = $2 AND status = 'approved'
       ORDER BY "createdAt" DESC
       LIMIT 50`,
      store.id,
      productId,
    )
    .catch(() => []);

  const reviewCount = reviews.length;
  const avgRating = reviewCount ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount) * 10) / 10 : 0;
  const ratingCounts = [0, 0, 0, 0, 0];
  for (const review of reviews) ratingCounts[review.rating - 1]++;

  const [catalog, shopper] = await Promise.all([
    db.storeProduct
      .findMany({ where: { storeId: store.id, status: { in: [...statuses] } }, select: catalogSelect, orderBy: { createdAt: "desc" }, take: 200 })
      .catch(() => []),
    loadShopperInfo(store.id, store.brandSettings),
  ]);

  const templateId = resolveStoreTemplateId(store.brandSettings);
  const { status: _status, ...withoutStatus } = store;
  void _status;
  // A live seasonal campaign's look (colours, sections, logo) on top of the store's own.
  const { brandSettings, ...rest } = preview ? withoutStatus : await withCampaignLook(withoutStatus);
  const publicStore = { ...rest, brandSettings: publicBrandSettings(brandSettings) };
  const { status: _productStatus, ...productRow } = product;
  void _productStatus;
  const publicProduct = forShoppers(productRow);
  const shopperCatalog = catalog.map((entry) => forShoppers(entry));

  return {
    store: publicStore,
    product: publicProduct,
    reviews: reviews.map((review) => ({
      ...review,
      images: review.images ?? [],
      createdAt: review.createdAt instanceof Date ? review.createdAt.toISOString() : String(review.createdAt),
      repliedAt: review.repliedAt instanceof Date ? review.repliedAt.toISOString() : null,
    })),
    avgRating,
    reviewCount,
    ratingCounts,
    catalog: shopperCatalog,
    // "Customers also like": the seller's picks (up to 8), else the closest products in the store.
    related: relatedProducts(publicProduct, shopperCatalog),
    shopper: shopper as StorefrontShopperInfo,
    themeId: isBoutiqueTheme(templateId) ? templateId : null,
  };
});

export type ProductPageData = NonNullable<Awaited<ReturnType<typeof loadProductPage>>>;

/**
 * What a live 2026-theme store needs to frame any other page (policies…) in its own header and footer:
 * the theme, its snapshot, the catalogue for search, and shopper info. Null for classic stores.
 */
export const loadStoreChrome = cache(async (slug: string) => {
  const store = await db.store
    .findUnique({ where: { slug }, select: { id: true, name: true, slug: true, description: true, logoUrl: true, city: true, country: true, currency: true, brandSettings: true, status: true } })
    .catch(() => null);
  if (!store) return null;
  const templateId = resolveStoreTemplateId(store.brandSettings);
  if (!isBoutiqueTheme(templateId)) return null;
  const [catalog, shopper] = await Promise.all([
    db.storeProduct.findMany({ where: { storeId: store.id, status: "published" }, select: catalogSelect, orderBy: { createdAt: "desc" }, take: 200 }).catch(() => []),
    loadShopperInfo(store.id, store.brandSettings),
  ]);
  const { status: _status, ...withoutStatus } = store;
  void _status;
  const { brandSettings, ...rest } = await withCampaignLook(withoutStatus);
  return {
    themeId: templateId,
    snapshot: boutiqueSnapshotFor(templateId, brandSettings),
    store: { ...rest, brandSettings: publicBrandSettings(brandSettings) },
    catalog: catalog.map((entry) => forShoppers(entry)),
    shopper: shopper as StorefrontShopperInfo,
  };
});

export type StoreChromeData = NonNullable<Awaited<ReturnType<typeof loadStoreChrome>>>;
