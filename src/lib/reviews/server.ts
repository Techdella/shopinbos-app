import "server-only";
import { db } from "@/lib/db/client";
import { storeUrl } from "@/lib/marketing/brand";
import { fromExternalReview, fromStoreReview, reviewModerationData, sortReviews, type ReviewItem, type ReviewStatusValue } from "./pure";

// Loading reviews from every source into one list. Reads fall back gracefully while the reviews migration
// (docs/migrations/2026-10-12-reviews.sql) hasn't been applied: store reviews still load, imported ones read
// as none.

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com").replace(/\/+$/, "");
}

/** Customer-facing pages on the store's own address (custom domain, subdomain or /s/<slug>); feed and widget on the app's API. */
export function reviewUrls(store: { slug: string; customDomain: string | null }) {
  const api = `${appUrl()}/api/public/store/${encodeURIComponent(store.slug)}/reviews`;
  return {
    wall: storeUrl(store, "/reviews"),
    reviewLink: (token: string) => storeUrl(store, `/review/${token}`),
    product: (productId: string) => storeUrl(store, `/product/${productId}`),
    feed: `${api}/feed.xml`,
    widget: `${api}/widget.js`,
  };
}

type StoreReviewRow = Parameters<typeof fromStoreReview>[0];

async function storeReviewRows(storeId: string, where: { approvedOnly?: boolean; productId?: string | null; ids?: string[] }, take: number): Promise<StoreReviewRow[]> {
  try {
    return await db.productReview.findMany({
      where: {
        storeId,
        ...(where.approvedOnly ? { status: "approved" as const } : {}),
        ...(where.productId ? { productId: where.productId } : {}),
        ...(where.ids ? { id: { in: where.ids } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  } catch {
    // Before the migration adds "featured", read the original columns directly.
    const params: unknown[] = [storeId];
    let sql = `SELECT id, "productId", "orderId", "buyerName", "buyerEmail", rating, title, body, images, status::text AS status, "sellerReply", "repliedAt", "createdAt"
               FROM "ProductReview" WHERE "storeId" = $1`;
    if (where.approvedOnly) sql += ` AND status::text = 'approved'`;
    if (where.productId) {
      params.push(where.productId);
      sql += ` AND "productId" = $${params.length}`;
    }
    if (where.ids) {
      params.push(where.ids);
      sql += ` AND id = ANY($${params.length})`;
    }
    sql += ` ORDER BY "createdAt" DESC LIMIT ${Math.max(1, Math.min(take, 5000))}`;
    return db.$queryRawUnsafe<StoreReviewRow[]>(sql, ...params).catch(() => []);
  }
}

export async function loadReviews(storeId: string, options: { approvedOnly?: boolean; productId?: string | null; take?: number } = {}): Promise<ReviewItem[]> {
  const take = options.take ?? 1000;
  const [own, imported] = await Promise.all([
    storeReviewRows(storeId, options, take),
    db.externalReview
      .findMany({
        where: { storeId, ...(options.approvedOnly ? { status: "approved" } : {}), ...(options.productId ? { productId: options.productId } : {}) },
        orderBy: { reviewedAt: "desc" },
        take,
      })
      .catch(() => []),
  ]);
  return sortReviews([...own.map(fromStoreReview), ...imported.map(fromExternalReview)]);
}

export async function loadReview(storeId: string, kind: "store" | "external", id: string): Promise<ReviewItem | null> {
  if (kind === "store") {
    const rows = await storeReviewRows(storeId, { ids: [id] }, 1);
    return rows[0] ? fromStoreReview(rows[0]) : null;
  }
  const row = await db.externalReview.findFirst({ where: { id, storeId } }).catch(() => null);
  return row ? fromExternalReview(row) : null;
}

/** Publish / hold back / hide, or feature / unfeature one review of this store. Returns false when it isn't theirs. */
export async function moderateReview(storeId: string, ref: { kind: "store" | "external"; id: string }, change: { status: ReviewStatusValue } | { featured: boolean }) {
  const data = reviewModerationData(change);
  const result =
    ref.kind === "store"
      ? await db.productReview.updateMany({ where: { id: ref.id, storeId }, data })
      : await db.externalReview.updateMany({ where: { id: ref.id, storeId }, data });
  return result.count > 0;
}

export async function productNames(storeId: string, ids?: string[]) {
  const products = await db.storeProduct
    .findMany({
      where: { storeId, ...(ids ? { id: { in: ids } } : { status: { not: "archived" } }) },
      select: { id: true, name: true, images: true, sku: true },
      orderBy: { name: "asc" },
      take: 1000,
    })
    .catch(() => []);
  return new Map(products.map((product) => [product.id, { name: product.name, image: product.images[0] ?? null, sku: product.sku }]));
}

export interface ReviewSettingsValue {
  autoRequest: boolean;
  requestDelayDays: number;
  requestChannel: "email" | "sms" | "whatsapp";
  autoApprove: boolean;
  saved: boolean;
}

export async function getReviewSettings(storeId: string): Promise<ReviewSettingsValue> {
  const row = await db.reviewSettings.findUnique({ where: { storeId } }).catch(() => null);
  const channel = row?.requestChannel === "sms" || row?.requestChannel === "whatsapp" ? row.requestChannel : "email";
  return {
    autoRequest: row?.autoRequest ?? false,
    requestDelayDays: row?.requestDelayDays ?? 3,
    requestChannel: channel,
    autoApprove: row?.autoApprove ?? false,
    saved: Boolean(row),
  };
}

export async function sellerStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true, customDomain: true } });
}
