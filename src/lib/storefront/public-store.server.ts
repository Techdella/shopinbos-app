import "server-only";
import { cache } from "react";
import { db } from "@/lib/db/client";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { getCurrentAppUser } from "@/lib/server-auth";
import { publicBrandSettings } from "@shared/public-brand-settings";
import { readPaymentBadges, type PaymentBadgeKey } from "@shared/payment-badges";
import { storeBadgeAvailability } from "@/lib/seller-payments.server";
import { showsShopinbosBadge } from "@/lib/store-badges";
import { forShoppers } from "@shared/product-stock";
import { loadShopperInfo } from "./shopper-info.server";
import { PREVIEW_PRODUCT_STATUSES, storeUnavailableReason, storefrontAccess, type StoreUnavailableReason } from "./store-visibility";
import { withCampaignLook } from "@/lib/store-campaigns/storefront.server";

// The public store payload (what /api/public/store/[slug] returns), loaded straight from the database.
// Server components use this instead of calling the app's own API over HTTP, which breaks whenever
// NEXT_PUBLIC_APP_URL points somewhere else. React's cache() shares one load between generateMetadata,
// the layout and the page of a request.

function storeSelect(productStatuses: readonly string[]) {
  return {
    id: true,
    userId: true,
    name: true,
    slug: true,
    description: true,
    logoUrl: true,
    country: true,
    city: true,
    currency: true,
    brandSettings: true,
    customDomain: true,
    status: true,
    // Only to decide the "Built with Shopinbos" badge; the plan itself never reaches shoppers.
    user: { select: { planCode: true, planStatus: true, planPaidUntil: true } },
    storeProducts: {
      where: { status: { in: [...productStatuses] } },
      select: {
        id: true,
        name: true,
        description: true,
        sku: true,
        images: true,
        retailPrice: true,
        compareAtPrice: true,
        currency: true,
        fulfillmentType: true,
        // imageUrl: the shop page's category tiles fall back to the category's own picture.
        category: { select: { id: true, name: true, slug: true, imageUrl: true } },
        variants: true,
        supplierProduct: { select: { stockQuantity: true, moq: true, preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true } },
        // Already public on each product page; the store blocks use them for "You may also like" and the
        // comparison table.
        productType: true,
        tags: true,
        productDetails: true,
        specifications: true,
        // Turned into `stock` by forShoppers (the raw counts never reach shoppers).
        trackStock: true,
        continueSellingWhenOut: true,
        currentStock: true,
        reservedStock: true,
        lowStockThreshold: true,
        // Preorders (shared/preorder.ts): forShoppers turns these into `preorder`.
        preorderEnabled: true,
        preorderShipsAt: true,
        preorderLimit: true,
        preorderTaken: true,
        preorderNote: true,
      },
      orderBy: { createdAt: "desc" as const },
    },
    pages: {
      where: { isPublished: true },
      select: { id: true, type: true, title: true, slug: true, content: true, publishedContent: true, order: true },
      orderBy: { order: "asc" as const },
    },
  };
}

function findStore(slug: string, productStatuses: readonly string[]) {
  return db.store.findUnique({ where: { slug }, select: storeSelect(productStatuses) });
}

type StoreRow = NonNullable<Awaited<ReturnType<typeof findStore>>>;

async function reviewStats(productIds: string[]) {
  const map = new Map<string, { avgRating: number; count: number }>();
  if (productIds.length === 0) return map;
  const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",");
  try {
    const rows = await db.$queryRawUnsafe<Array<{ productId: string; avg: number; count: bigint }>>(
      `SELECT "productId", AVG(rating)::float AS avg, COUNT(*)::bigint AS count FROM "ProductReview" WHERE "productId" = ANY(ARRAY[${placeholders}]) AND status = 'approved' GROUP BY "productId"`,
      ...productIds,
    );
    for (const row of rows) map.set(row.productId, { avgRating: Math.round(row.avg * 10) / 10, count: Number(row.count) });
  } catch {
    /* review table may not exist yet */
  }
  return map;
}

/**
 * The storefront's two footer badges: whether to show "Built with Shopinbos" (every store, unless a paid seller turned it off) and the payment
 * logos. Only these answers go to shoppers, never the owner's plan.
 */
export interface StoreBadges {
  showBadge: boolean;
  paymentBadges: PaymentBadgeKey[];
}

async function storeBadges(storeId: string, owner: { planCode: string | null; planStatus: string | null; planPaidUntil: Date | null } | null | undefined, brandSettings: unknown): Promise<StoreBadges> {
  // Only logos for ways this store's checkout really takes payment now (shared/payment-badges.ts).
  const { available } = await storeBadgeAvailability(storeId, brandSettings);
  return { showBadge: showsShopinbosBadge(owner, new Date(), brandSettings), paymentBadges: readPaymentBadges(brandSettings, available) };
}

/** Shapes a store row into the public payload: public brand settings, review stats, shopper info, no owner id or plan. */
async function shapePublicStore(row: StoreRow) {
  const { userId: _userId, user: owner, ...store } = row;
  void _userId;
  const reviews = await reviewStats(store.storeProducts.map((product) => product.id));
  const storeProducts = store.storeProducts.map((product) => ({
    // Tracked stock as `stock`, version counts only where they apply (shared/product-stock.ts).
    ...forShoppers(product),
    avgRating: reviews.get(product.id)?.avgRating ?? 0,
    reviewCount: reviews.get(product.id)?.count ?? 0,
  }));
  // Delivery promises, pay-on-delivery, WhatsApp, collections and review highlights for the storefront chrome.
  const shopper = await loadShopperInfo(store.id, store.brandSettings, storeProducts);
  await getPlanCatalog(); // plans created from admin count for the badge rule
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- brand settings are free-form JSON each renderer reads its own way
  const brandSettings = (publicBrandSettings(store.brandSettings) ?? {}) as Record<string, any>;
  const payload = { ...store, brandSettings, storeProducts, shopper, ...(await storeBadges(store.id, owner, store.brandSettings)) };
  // The same plain JSON the API sends, so client components get identical props either way.
  return JSON.parse(JSON.stringify(payload)) as typeof payload;
}

export type PublicStore = Awaited<ReturnType<typeof shapePublicStore>>;

export type PublicStoreResult =
  | { kind: "missing" }
  | { kind: "unavailable"; reason: StoreUnavailableReason; ownerId: string }
  | { kind: "live"; store: PublicStore };

/** The live store as shoppers and the public API see it. */
export const loadPublicStore = cache(async (slug: string): Promise<PublicStoreResult> => {
  const row = await findStore(slug, ["published"]);
  if (!row) return { kind: "missing" };
  const reason = storeUnavailableReason(row, row.pages.length);
  if (reason) return { kind: "unavailable", reason, ownerId: row.userId };
  return { kind: "live", store: await shapePublicStore(row) };
});

/** Name, logo and colours for a store that isn't open yet (the "not open yet" page and storefront 404s). */
export interface StoreBrand extends StoreBadges {
  /** For the storefront layout's seasonal-campaign layer (only open stores show campaigns). */
  id: string;
  active: boolean;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** The verified domain the store is served on (its canonical address), if any. */
  customDomain: string | null;
  /** For the seller's tags' shop events (value and currency). */
  currency: string;
  brandSettings: Record<string, unknown>;
}

/** Also what the storefront layouts hand every page's footer: the "Built with Shopinbos" badge and payment logos. */
export const loadStoreBrand = cache(async (slug: string): Promise<StoreBrand | null> => {
  const store = await db.store
    .findUnique({ where: { slug }, select: { id: true, status: true, name: true, slug: true, logoUrl: true, customDomain: true, currency: true, brandSettings: true, user: { select: { planCode: true, planStatus: true, planPaidUntil: true } } } })
    .catch(() => null);
  if (!store) return null;
  await getPlanCatalog(); // plans created from admin count for the badge rule
  return {
    id: store.id,
    active: store.status === "active",
    name: store.name,
    slug: store.slug,
    logoUrl: store.logoUrl,
    customDomain: store.customDomain,
    currency: store.currency,
    brandSettings: (publicBrandSettings(store.brandSettings) ?? {}) as Record<string, unknown>,
    ...(await storeBadges(store.id, store.user, store.brandSettings)),
  };
});

export type StorefrontView =
  | { access: "missing" }
  | { access: "closed"; brand: StoreBrand }
  | { access: "live" | "preview"; store: PublicStore };

/**
 * What a shopper page should render: the live store, the owner's preview of a store that isn't live yet
 * (drafts included), or the "not open yet" page for everyone else. Sign-in is only checked for stores
 * that aren't live, so live storefronts never touch auth.
 */
export const resolveStorefront = cache(async (slug: string): Promise<StorefrontView> => {
  const result = await loadPublicStore(slug);
  if (result.kind === "missing") return { access: "missing" };
  // A live seasonal campaign changes the look (merged on top: the store's own design is untouched).
  if (result.kind === "live") return { access: "live", store: await withCampaignLook(result.store) };

  const user = await getCurrentAppUser().catch(() => null);
  if (storefrontAccess(false, Boolean(user && user.id === result.ownerId)) === "preview") {
    const row = await findStore(slug, PREVIEW_PRODUCT_STATUSES);
    if (row) return { access: "preview", store: await shapePublicStore(row) };
  }
  const brand = await loadStoreBrand(slug);
  return brand ? { access: "closed", brand } : { access: "missing" };
});
