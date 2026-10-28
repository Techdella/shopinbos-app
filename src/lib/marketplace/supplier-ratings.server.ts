import "server-only";

import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify.server";
import { cleanRating, ratingProblem, ratingSummary, type RatingKind } from "@shared/supplier-ratings";

// Sellers rate suppliers (shared/supplier-ratings.ts has the rules): after a wholesale order or sample arrives, or a
// supplier delivers a dropship parcel for the seller's customer. Each rating is a SupplierReview (targetRole
// "supplier"), so the supplier sees and answers it on their Reviews page and it counts towards their level; the
// average and count are kept on Supplier.rating / ratingCount for Find. Used by POST /api/app/supplier-reviews
// (phone and web) and the web action (src/app/actions/supplier-reviews.ts).

export interface MyRating {
  kind: RatingKind;
  orderId: string;
  rating: number;
  text: string | null;
}

export type RateResult = { ok: true; rating: MyRating; supplier: { rating: number; count: number } } | { ok: false; code: "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT"; message: string };

/** The order and who supplied it, when this seller placed it (wholesale: theirs; dropship: their store's). */
async function orderFor(sellerId: string, kind: RatingKind, orderId: string) {
  if (kind === "wholesale_order") {
    const order = await db.wholesaleOrder.findUnique({ where: { id: orderId }, select: { id: true, status: true, sellerId: true, supplierId: true, supplier: { select: { userId: true, displayName: true } } } });
    return order ? { status: order.status as string, isBuyer: order.sellerId === sellerId, supplierId: order.supplierId, supplierUserId: order.supplier.userId, supplierName: order.supplier.displayName } : null;
  }
  const order = await db.supplierOrder.findUnique({ where: { id: orderId }, select: { id: true, status: true, sellerId: true, supplierId: true, supplier: { select: { userId: true, displayName: true } } } });
  return order ? { status: order.status, isBuyer: order.sellerId === sellerId, supplierId: order.supplierId, supplierUserId: order.supplier.userId, supplierName: order.supplier.displayName } : null;
}

/** Keeps Supplier.rating / ratingCount in step with the shops' ratings (active ones). */
export async function refreshSupplierRating(supplierId: string) {
  const rows = await db.supplierReview.findMany({ where: { supplierId, targetRole: "supplier", status: "active" }, select: { rating: true }, take: 5000 });
  const summary = ratingSummary(rows.map((row) => row.rating));
  await db.supplier.update({ where: { id: supplierId }, data: { rating: summary.rating, ratingCount: summary.count } });
  return summary;
}

export async function rateSupplier(seller: { id: string; name?: string | null }, input: { kind: RatingKind; orderId: string; rating: unknown; text?: unknown }): Promise<RateResult> {
  const clean = cleanRating(input);
  if (!clean.ok) return { ok: false, code: "BAD_REQUEST", message: clean.message };
  const order = await orderFor(seller.id, input.kind, input.orderId);
  if (!order) return { ok: false, code: "NOT_FOUND", message: "We couldn't find that order." };
  const existing = await db.supplierReview.findUnique({ where: { supplierId_interactionId_reviewerId: { supplierId: order.supplierId, interactionId: input.orderId, reviewerId: seller.id } }, select: { id: true } });
  const problem = ratingProblem({ kind: input.kind, status: order.status, isBuyer: order.isBuyer, alreadyRated: Boolean(existing) });
  if (problem) return { ok: false, code: existing ? "CONFLICT" : order.isBuyer ? "BAD_REQUEST" : "NOT_FOUND", message: problem };
  try {
    await db.supplierReview.create({
      data: {
        supplierId: order.supplierId,
        reviewerId: seller.id,
        targetId: order.supplierId,
        targetRole: "supplier",
        interactionType: input.kind,
        interactionId: input.orderId,
        rating: clean.rating,
        comment: clean.text,
        status: "active",
      },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") return { ok: false, code: "CONFLICT", message: "You already rated this order." };
    throw error;
  }
  const supplier = await refreshSupplierRating(order.supplierId);
  void import("@/lib/supplier-levels.server").then((levels) => levels.refreshSupplierLevel(order.supplierId)).catch(() => undefined);
  await notify({
    userId: order.supplierUserId,
    event: "supplier_review.new",
    title: `A shop rated you ${clean.rating}★`,
    description: clean.text ? `“${clean.text}” Reply on your Reviews page.` : "See it and reply on your Reviews page.",
    link: "/supplier/reviews",
    actionLabel: "Reply",
    actionUrl: "/supplier/reviews",
    metadata: { kind: input.kind, orderId: input.orderId },
    dedupeKey: `supplier_review.new:${input.orderId}:${seller.id}`,
  }).catch(() => null);
  return { ok: true, rating: { kind: input.kind, orderId: input.orderId, rating: clean.rating, text: clean.text }, supplier };
}

/** The seller's own ratings (newest first), so the screens show "You rated 5★" instead of "Rate the supplier". */
export async function myRatings(sellerId: string, orderIds?: readonly string[]): Promise<MyRating[]> {
  const rows = await db.supplierReview.findMany({
    where: { reviewerId: sellerId, targetRole: "supplier", ...(orderIds ? { interactionId: { in: [...orderIds] } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { interactionType: true, interactionId: true, rating: true, comment: true },
  });
  return rows.map((row) => ({ kind: row.interactionType === "dropship_order" ? "dropship_order" : "wholesale_order", orderId: row.interactionId, rating: row.rating, text: row.comment ?? null }));
}

/** The supplier orders behind one of the seller's store orders, for "Rate the supplier" on the order page. */
export async function ratableDropshipOrders(sellerId: string, retailOrderId: string) {
  const rows = await db.supplierOrder.findMany({
    where: { retailOrderId, sellerId },
    select: { id: true, status: true, supplier: { select: { displayName: true } } },
    take: 10,
  });
  const mine = await myRatings(sellerId, rows.map((row) => row.id));
  return rows.map((row) => ({ id: row.id, status: row.status, supplierName: row.supplier.displayName, canRate: row.status === "delivered", rated: mine.find((rating) => rating.orderId === row.id) ?? null }));
}

/** The latest ratings shops gave a supplier (product page in Find). */
export async function latestSupplierRatings(supplierId: string, take = 3) {
  const rows = await db.supplierReview.findMany({
    where: { supplierId, targetRole: "supplier", status: "active" },
    orderBy: { createdAt: "desc" },
    take,
    select: { rating: true, comment: true, createdAt: true },
  });
  return rows.map((row) => ({ rating: row.rating, text: row.comment ?? null, at: row.createdAt.toISOString() }));
}
