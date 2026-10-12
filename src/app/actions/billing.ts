"use server";

import { db } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";

export async function updateFeeBearer(formData: FormData) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  if (!partner) redirect("/logistics/profile");

  const bearer = String(formData.get("feeBearer") || "seller").trim();
  if (!["seller", "supplier", "logistics_partner"].includes(bearer)) {
    redirect("/logistics/billing?error=Invalid%20fee%20bearer");
  }

  const config = await db.platformFeeConfig.findFirst({ where: { active: true } });
  if (config) {
    await db.platformFeeConfig.update({ where: { id: config.id }, data: { bearer } });
  } else {
    await db.platformFeeConfig.create({ data: { active: true, rate: 1.5, bearer } });
  }

  revalidatePath("/logistics/billing");
  redirect("/logistics/billing?saved=1");
}

export async function getBillingData(logisticsPartnerId: string) {
  // Exported from a "use server" file, so it is callable from the browser: only the partner itself (or an admin).
  const user = await requireRole(["logistics_partner", "admin"], "/logistics/login");
  if (user.role !== "admin") {
    const own = await db.logisticsPartner.findFirst({ where: { id: logisticsPartnerId, userId: user.id }, select: { id: true } });
    if (!own) throw new Error("Not allowed");
  }
  const [feeConfig, bookings] = await Promise.all([
    db.platformFeeConfig.findFirst({ where: { active: true } }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, deliveryFee: true, platformFee: true, feeBearer: true,
        netAmount: true, currency: true, status: true, createdAt: true,
        seller: { select: { name: true } },
      },
    }),
  ]);

  const rate = feeConfig?.rate ?? 1.5;
  const bearer = feeConfig?.bearer ?? "seller";

  const delivered = bookings.filter((b) => b.status === "delivered");
  const totalGross = delivered.reduce((s, b) => s + b.deliveryFee, 0);
  const totalFees = delivered.reduce((s, b) => s + b.platformFee, 0);
  const totalNet = delivered.reduce((s, b) => s + b.netAmount, 0);

  return {
    feeConfig: { rate, bearer, exists: !!feeConfig },
    bookings: bookings.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      displayFee: b.platformFee || Math.round(b.deliveryFee * rate / 100),
      displayNet: b.netAmount || b.deliveryFee - (b.platformFee || Math.round(b.deliveryFee * rate / 100)),
    })),
    metrics: { totalGross, totalFees, totalNet, deliveredCount: delivered.length },
  };
}
