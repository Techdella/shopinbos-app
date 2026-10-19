"use server";

import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getPriceBook } from "@/lib/pricing/price-book.server";

export async function getBillingData(logisticsPartnerId: string) {
  // Exported from a "use server" file, so it is callable from the browser: only the partner itself (or an admin).
  const user = await requireRole(["logistics_partner", "admin"], "/logistics/login");
  if (user.role !== "admin") {
    const own = await db.logisticsPartner.findFirst({ where: { id: logisticsPartnerId, userId: user.id }, select: { id: true } });
    if (!own) throw new Error("Not allowed");
  }
  const [book, bookings] = await Promise.all([
    getPriceBook(),
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

  // Set by Shopinbos in Admin › Pricing; partners only see it.
  const rate = book["delivery.fee_rate"];
  const bearer = book["delivery.fee_bearer"];

  const delivered = bookings.filter((b) => b.status === "delivered");
  const totalGross = delivered.reduce((s, b) => s + b.deliveryFee, 0);
  const totalFees = delivered.reduce((s, b) => s + b.platformFee, 0);
  const totalNet = delivered.reduce((s, b) => s + b.netAmount, 0);

  return {
    feeConfig: { rate, bearer },
    bookings: bookings.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      displayFee: b.platformFee || Math.round(b.deliveryFee * rate / 100),
      displayNet: b.netAmount || b.deliveryFee - (b.platformFee || Math.round(b.deliveryFee * rate / 100)),
    })),
    metrics: { totalGross, totalFees, totalNet, deliveredCount: delivered.length },
  };
}
