import "server-only";
import { db } from "@/lib/db/client";
import { reviewLinkExpired, verifyReviewToken } from "./pure";
import { reviewLinkSecret } from "./secrets";
import { getReviewSettings } from "./server";

// The buyer side: review links, submitting reviews from a link or the product page.

export interface OrderItemForReview {
  productId: string;
  name: string;
  image: string | null;
  alreadyReviewed: boolean;
}

function orderItems(items: unknown): Array<{ productId: string; name: string; image: string | null }> {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: Array<{ productId: string; name: string; image: string | null }> = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId : typeof item.id === "string" ? item.id : "";
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    out.push({ productId, name: String(item.name ?? "Item"), image: typeof item.image === "string" ? item.image : null });
  }
  return out;
}

async function reviewedProductIds(orderId: string) {
  const rows = await db.$queryRawUnsafe<Array<{ productId: string }>>(`SELECT "productId" FROM "ProductReview" WHERE "orderId" = $1`, orderId).catch(() => []);
  return new Set(rows.map((row) => row.productId));
}

/** Everything the review-link page needs, or why the link doesn't work. */
export async function resolveReviewLink(slug: string, token: string) {
  const requestId = verifyReviewToken(token, reviewLinkSecret());
  if (!requestId) return { error: "invalid" as const };
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, logoUrl: true, status: true } });
  if (!store || store.status !== "active") return { error: "invalid" as const };
  const request = await db.reviewRequest.findFirst({ where: { id: requestId, storeId: store.id } }).catch(() => null);
  if (!request) return { error: "invalid" as const };
  if (reviewLinkExpired(request.createdAt)) return { error: "expired" as const, store };
  const order = await db.retailOrder.findFirst({ where: { id: request.orderId, storeId: store.id }, select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, items: true } });
  if (!order) return { error: "invalid" as const };
  const reviewed = await reviewedProductIds(order.id);
  const items: OrderItemForReview[] = orderItems(order.items).map((item) => ({ ...item, alreadyReviewed: reviewed.has(item.productId) }));
  return { error: null, store, request, order, items };
}

export async function markRequestOpened(requestId: string) {
  await db.reviewRequest.updateMany({ where: { id: requestId, openedAt: null }, data: { openedAt: new Date(), status: "opened" } }).catch(() => undefined);
}

export interface ReviewInput {
  productId: string;
  rating: number;
  title: string;
  body: string;
  images: string[];
}

/** Only photos uploaded through our review photo route are accepted. */
export function ownReviewPhoto(url: string, storeId: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(base && url.startsWith(base) && url.includes(`/reviews/${storeId}/photos/`));
}

/**
 * Saves reviews for items of one order. Products must be in the order; each order + product is reviewed once.
 * New reviews are published straight away when the seller turned on auto-publish, otherwise they wait.
 */
export async function saveOrderReviews(input: { storeId: string; order: { id: string; buyerName: string; buyerEmail: string; items: unknown }; buyerName?: string; reviews: ReviewInput[] }) {
  const allowed = new Set(orderItems(input.order.items).map((item) => item.productId));
  const reviewed = await reviewedProductIds(input.order.id);
  const settings = await getReviewSettings(input.storeId);
  const status = settings.autoApprove ? "approved" : "pending";
  const name = (input.buyerName?.trim() || input.order.buyerName).slice(0, 120);
  let saved = 0;
  const skipped: string[] = [];
  for (const review of input.reviews) {
    if (!allowed.has(review.productId) || reviewed.has(review.productId)) {
      skipped.push(review.productId);
      continue;
    }
    const product = await db.storeProduct.findFirst({ where: { id: review.productId, storeId: input.storeId }, select: { id: true } });
    if (!product) {
      skipped.push(review.productId);
      continue;
    }
    const images = review.images.filter((url) => ownReviewPhoto(url, input.storeId)).slice(0, 6);
    // Raw insert so this works whether or not the reviews migration has added its new columns yet.
    await db.$executeRawUnsafe(
      `INSERT INTO "ProductReview" (id, "storeId", "productId", "orderId", "buyerName", "buyerEmail", rating, title, body, images, status, "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, '${status}', NOW())`,
      input.storeId, review.productId, input.order.id, name, input.order.buyerEmail, review.rating, review.title.slice(0, 200), review.body.slice(0, 5000), images,
    );
    reviewed.add(review.productId);
    saved++;
  }
  return { saved, skipped, published: status === "approved" };
}
