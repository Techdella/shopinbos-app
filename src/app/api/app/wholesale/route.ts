import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { payableWholesaleOrders } from "@/lib/supplier-orders/wholesale-payments.server";

export const dynamic = "force-dynamic";

// GET /api/app/wholesale: the seller's wholesale orders, newest first, with whether each can be paid by card now
// (the supplier accepted it and takes card payments; PATCH ./[id] { action: "pay" } starts it).
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const orders = await db.wholesaleOrder.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, status: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, rejectReason: true, trackingCode: true, createdAt: true, acceptBy: true,
      paidAt: true, paidOutAt: true, expiredAt: true,
      supplier: { select: { id: true, displayName: true, userId: true } },
      supplierProduct: { select: { id: true, name: true, images: true } },
    },
  });
  const payable = await payableWholesaleOrders(orders);
  return ok(
    orders.map(({ supplier, supplierProduct, ...order }) => ({
      ...order,
      supplier: { id: supplier.id, name: supplier.displayName, userId: supplier.userId },
      product: { id: supplierProduct.id, name: supplierProduct.name, image: Array.isArray(supplierProduct.images) ? (supplierProduct.images[0] ?? null) : null },
      canPay: payable.has(order.id),
    })),
  );
});
