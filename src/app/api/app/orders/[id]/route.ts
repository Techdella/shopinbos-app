import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { orderRow } from "@/lib/dashboard/compute";
import { OrderStatusUpdateSchema, updateOrderStatus } from "@/lib/orders/update-status";

export const GET = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);
  // Dropship items: where each supplier is with them.
  const supplierOrders = await db.supplierOrder.findMany({
    where: { retailOrderId: order.id, storeId: store.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, items: true, trackingCode: true, carrier: true, rejectReason: true, shippedAt: true, deliveredAt: true, supplier: { select: { id: true, displayName: true } } },
  });

  return ok({ ...order, supplierOrders, row: orderRow({ ...order, total: Number(order.total) }) });
});

export const PATCH = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => ({}));
  const parsed = OrderStatusUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);

  const result = await updateOrderStatus(store, order, parsed.data);
  if (!result.ok) return apiError("BAD_REQUEST", result.error);
  const updated = result.order;

  return ok({ ...updated, row: orderRow({ ...updated, total: Number(updated.total) }) });
});
