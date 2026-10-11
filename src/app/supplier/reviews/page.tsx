import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { SupplierReviewsClient } from "./SupplierReviewsClient";

export const dynamic = "force-dynamic";

export default async function SupplierReviewsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const [incoming, outgoing] = await Promise.all([
    db.supplierReview.findMany({
      where: { supplierId: supplier.id, targetRole: "supplier" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.supplierReview.findMany({
      where: { supplierId: supplier.id, targetRole: { not: "supplier" } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const completedOrders = await db.wholesaleOrder.findMany({
    where: {
      supplierId: supplier.id,
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

  const reviewedOrderIds = new Set(
    outgoing.filter((r) => r.interactionType === "wholesale_order").map((r) => r.interactionId)
  );
  const unreviewedOrders = completedOrders.filter((o) => !reviewedOrderIds.has(o.id));

  const completedBookings = await db.deliveryBooking.findMany({
    where: {
      status: "delivered",
      sellerId: user.id,
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

  const reviewedBookingIds = new Set(
    outgoing.filter((r) => r.interactionType === "delivery_booking").map((r) => r.interactionId)
  );
  const unreviewedBookings = completedBookings.filter((b) => !reviewedBookingIds.has(b.id));

  const total = incoming.length;
  const avgRating = total > 0
    ? Math.round((incoming.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10
    : 0;
  const distribution = [0, 0, 0, 0, 0];
  incoming.forEach((r) => { if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++; });
  const responded = incoming.filter((r) => r.reply).length;

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="Reviews"
      sub={total > 0
        ? `${total} review${total === 1 ? "" : "s"} about you · ${avgRating.toFixed(1)} average`
        : "Reviews show up after sellers or delivery partners work with you."}
    >
      <SupplierReviewsClient
        supplierId={supplier.id}
        incoming={incoming.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          repliedAt: r.repliedAt?.toISOString() ?? null,
          updatedAt: r.updatedAt.toISOString(),
        }))}
        outgoing={outgoing.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          repliedAt: r.repliedAt?.toISOString() ?? null,
          updatedAt: r.updatedAt.toISOString(),
        }))}
        unreviewedOrders={unreviewedOrders.map((o) => ({
          ...o,
          totalPrice: Number(o.totalPrice),
          createdAt: o.createdAt.toISOString(),
        }))}
        unreviewedBookings={unreviewedBookings.map((b) => ({
          ...b,
          deliveryFee: Number(b.deliveryFee),
          createdAt: b.createdAt.toISOString(),
        }))}
        stats={{ total, avgRating, distribution, responded }}
        supplierRating={supplier.rating}
        supplierRatingCount={supplier.ratingCount}
      />
    </AppPage>
  );
}
