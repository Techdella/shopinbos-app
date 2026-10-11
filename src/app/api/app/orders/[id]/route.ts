import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { z } from "zod";
import { triggerAutomations } from "@/lib/automations/engine";
import { orderRow } from "@/lib/dashboard/compute";
import { statusWhenMarkedPaid } from "@shared/sales";

const STATUS_EVENTS: Record<string, string> = {
  processing: "order_processing",
  packed: "order_packed",
  shipped: "order_shipped",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

const UpdateSchema = z.object({
  // "paid" is the seller confirming cash, transfer or POS for an unpaid order (e.g. a recorded sale).
  status: z.enum(["paid", "processing", "packed", "shipped", "delivered", "cancelled"]),
  paymentMethod: z.enum(["transfer", "cash", "pos"]).optional(),
  notes: z.string().optional(),
  trackingCode: z.string().optional(),
  logisticsType: z.enum(["personal", "network", "pickup"]).optional(),
  logisticsDetails: z.record(z.string(), z.unknown()).optional(),
});

export const GET = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);

  return ok({ ...order, row: orderRow({ ...order, total: Number(order.total) }) });
});

export const PATCH = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid body");

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);

  const updateData: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === "paid") {
    if (order.status !== "pending" && order.status !== "awaiting_payment") return apiError("BAD_REQUEST", "This order is already paid");
    const status = statusWhenMarkedPaid(order.logisticsDetails);
    updateData.status = status;
    updateData.paymentMethod = parsed.data.paymentMethod ?? order.paymentMethod ?? "transfer";
    if (status === "delivered") updateData.deliveredAt = new Date();
  }
  if (parsed.data.notes) updateData.notes = parsed.data.notes;
  if (parsed.data.trackingCode) updateData.trackingCode = parsed.data.trackingCode;
  if (parsed.data.logisticsType) updateData.logisticsDetails = { type: parsed.data.logisticsType, ...(parsed.data.logisticsDetails || {}) };
  if (parsed.data.status === "shipped") updateData.shippedAt = new Date();
  if (parsed.data.status === "delivered") updateData.deliveredAt = new Date();

  const updated = await db.retailOrder.update({
    where: { id },
    data: updateData,
  });

  const event = STATUS_EVENTS[parsed.data.status];
  if (event) {
    Promise.allSettled([
      triggerAutomations(event, {
        storeId: store.id,
        storeName: store.name,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName,
        orderNumber: order.orderNumber,
        orderTotal: Number(order.total),
        currency: order.currency,
      }),
    ]).catch(() => {});
  }

  return ok({ ...updated, row: orderRow({ ...updated, total: Number(updated.total) }) });
});
