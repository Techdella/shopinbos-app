"use server";

import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";

export async function respondToReview(formData: FormData) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id } });
  if (!partner) return { success: false, error: "Partner not found" };

  const reviewId = String(formData.get("reviewId") || "").trim();
  const response = String(formData.get("response") || "").trim();
  if (!reviewId || !response) return { success: false, error: "Missing review ID or response" };

  await db.logisticsReview.update({
    where: { id: reviewId, logisticsPartnerId: partner.id },
    data: { response, respondedAt: new Date() },
  });

  revalidatePath("/logistics/reviews");
  return { success: true };
}

export async function getReviewMetrics(logisticsPartnerId: string) {
  const reviews = await db.logisticsReview.findMany({
    where: { logisticsPartnerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reviewer: { select: { id: true, name: true, role: true, avatarUrl: true } },
    },
  });

  const total = reviews.length;
  const avgRating = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const distribution = [0, 0, 0, 0, 0];
  reviews.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++; });
  const responded = reviews.filter((r) => r.response).length;

  return { reviews, total, avgRating, distribution, responded };
}

async function requireSellerStoreId() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeId = workspace?.store?.id;
  if (!storeId) throw new Error("Store not found");
  return storeId;
}

export async function ensureReviewTable() {
  return;
}

export async function moderateReview(formData: FormData) {
  const storeId = await requireSellerStoreId();
  const id = String(formData.get("id") || "").trim();
  const status = String(formData.get("status") || "").trim();

  if (!id || !["approved", "pending", "rejected"].includes(status)) {
    return;
  }

  await db.productReview.updateMany({
    where: { id, storeId },
    data: { status: status as "approved" | "pending" | "rejected" },
  });

  revalidatePath("/home/reviews");
}

export async function replyToReview(formData: FormData) {
  const storeId = await requireSellerStoreId();
  const id = String(formData.get("id") || "").trim();
  const reply = String(formData.get("reply") || "").trim();

  if (!id) return;

  await db.productReview.updateMany({
    where: { id, storeId },
    data: {
      sellerReply: reply,
      repliedAt: reply ? new Date() : null,
    },
  });

  revalidatePath("/home/reviews");
}

export async function deleteReview(formData: FormData) {
  const storeId = await requireSellerStoreId();
  const id = String(formData.get("id") || "").trim();

  if (!id) return;

  await db.productReview.deleteMany({
    where: { id, storeId },
  });

  revalidatePath("/home/reviews");
}
