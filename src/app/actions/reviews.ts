"use server";

import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";

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
