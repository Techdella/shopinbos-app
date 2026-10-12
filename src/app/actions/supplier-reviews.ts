"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser, ensureSupplierAccess } from "@/lib/role-queries";

function fmt(n: number) { return Math.round(n * 10) / 10; }

/** These readers are server actions (callable from the browser): only the supplier itself or an admin. */
async function assertOwnSupplier(supplierId: string) {
  const user = await requireRole(["supplier", "admin"], "/supplier/login");
  if (user.role === "admin") return;
  const own = await db.supplier.findFirst({ where: { id: supplierId, userId: user.id }, select: { id: true } });
  if (!own) throw new Error("Not allowed");
}

export async function getSupplierReviewMetrics(supplierId: string) {
  await assertOwnSupplier(supplierId);
  const [incoming, outgoing] = await Promise.all([
    db.supplierReview.findMany({
      where: { supplierId, targetRole: "supplier", status: "active" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.supplierReview.findMany({
      where: { supplierId, targetRole: { not: "supplier" }, status: "active" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const total = incoming.length;
  const avgRating = total > 0 ? fmt(incoming.reduce((s, r) => s + r.rating, 0) / total) : 0;
  const distribution = [0, 0, 0, 0, 0];
  incoming.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++; });
  const responded = incoming.filter((r) => r.reply).length;

  return { total, avgRating, distribution, responded, reviewCount: total };
}

export async function respondToSupplierReview(formData: FormData) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const reviewId = String(formData.get("reviewId") || "").trim();
  const reply = String(formData.get("reply") || "").trim();

  if (!reviewId || !reply) {
    return { success: false, error: "Missing review ID or reply" };
  }

  const review = await db.supplierReview.findFirst({
    where: { id: reviewId, supplierId: supplier.id, targetRole: "supplier" },
  });

  if (!review) {
    return { success: false, error: "Review not found" };
  }

  await db.supplierReview.update({
    where: { id: review.id },
    data: { reply, repliedAt: new Date() },
  });

  revalidatePath("/supplier/reviews");
  return { success: true };
}

export async function reviewSeller(formData: FormData) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const sellerId = String(formData.get("sellerId") || "").trim();
  const orderId = String(formData.get("orderId") || "").trim();
  const rating = parseInt(String(formData.get("rating") || "0"), 10);
  const title = String(formData.get("title") || "").trim();
  const comment = String(formData.get("comment") || "").trim();

  if (!sellerId || !orderId || rating < 1 || rating > 5) {
    return { success: false, error: "Invalid review data" };
  }

  const order = await db.wholesaleOrder.findFirst({
    where: { id: orderId, supplierId: supplier.id, sellerId },
    select: { id: true, status: true },
  });

  if (!order || !["delivered", "shipped", "confirmed"].includes(order.status)) {
    return { success: false, error: "Can only review after an order is shipped or delivered" };
  }

  const existing = await db.supplierReview.findUnique({
    where: { supplierId_interactionId_reviewerId: { supplierId: supplier.id, interactionId: orderId, reviewerId: user.id } },
  });

  if (existing) {
    return { success: false, error: "You have already reviewed this order" };
  }

  await db.supplierReview.create({
    data: {
      supplierId: supplier.id,
      reviewerId: user.id,
      targetId: sellerId,
      targetRole: "seller",
      interactionType: "wholesale_order",
      interactionId: orderId,
      rating,
      title: title || undefined,
      comment: comment || undefined,
      status: "active",
    },
  });

  revalidatePath("/supplier/reviews");
  revalidatePath("/supplier/orders");
  return { success: true };
}

export async function reviewLogisticsPartner(formData: FormData) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const logisticsUserId = String(formData.get("logisticsUserId") || "").trim();
  const bookingId = String(formData.get("bookingId") || "").trim();
  const rating = parseInt(String(formData.get("rating") || "0"), 10);
  const title = String(formData.get("title") || "").trim();
  const comment = String(formData.get("comment") || "").trim();

  if (!logisticsUserId || !bookingId || rating < 1 || rating > 5) {
    return { success: false, error: "Invalid review data" };
  }

  // Only a delivery this supplier booked (same rule as getReviewableBookings).
  const booking = await db.deliveryBooking.findFirst({
    where: { id: bookingId, sellerId: user.id },
    select: { id: true, status: true, logisticsPartner: { select: { userId: true } } },
  });

  if (!booking || booking.status !== "delivered") {
    return { success: false, error: "Can only review after delivery is completed" };
  }

  if (booking.logisticsPartner.userId !== logisticsUserId) {
    return { success: false, error: "Booking does not match this logistics partner" };
  }

  const existing = await db.supplierReview.findUnique({
    where: { supplierId_interactionId_reviewerId: { supplierId: supplier.id, interactionId: bookingId, reviewerId: user.id } },
  });

  if (existing) {
    return { success: false, error: "You have already reviewed this booking" };
  }

  await db.supplierReview.create({
    data: {
      supplierId: supplier.id,
      reviewerId: user.id,
      targetId: logisticsUserId,
      targetRole: "logistics_partner",
      interactionType: "delivery_booking",
      interactionId: bookingId,
      rating,
      title: title || undefined,
      comment: comment || undefined,
      status: "active",
    },
  });

  revalidatePath("/supplier/reviews");
  revalidatePath("/supplier/orders");
  return { success: true };
}

export async function getReviewableOrders(supplierId: string) {
  await assertOwnSupplier(supplierId);
  return db.wholesaleOrder.findMany({
    where: {
      supplierId,
      status: { in: ["delivered", "shipped", "confirmed"] },
    },
    select: {
      id: true,
      status: true,
      totalPrice: true,
      createdAt: true,
      seller: { select: { id: true, name: true } },
      supplierProduct: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getReviewableBookings(supplierId: string) {
  await assertOwnSupplier(supplierId);
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { userId: true },
  });
  if (!supplier) return [];

  return db.deliveryBooking.findMany({
    where: {
      status: "delivered",
      sellerId: supplier.userId,
    },
    select: {
      id: true,
      createdAt: true,
      deliveryFee: true,
      logisticsPartner: { select: { id: true, userId: true, displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
