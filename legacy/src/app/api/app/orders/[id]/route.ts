import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { z } from "zod";
import { triggerAutomations } from "@/lib/automations/engine";

const STATUS_EVENTS: Record<string, string> = {
  processing: "order_processing",
  packed: "order_packed",
  shipped: "order_shipped",
  delivered: "order_delivered",
  cancelled: "order_cancelled",
};

const UpdateSchema = z.object({
  status: z.enum(["processing", "packed", "shipped", "delivered", "cancelled"]),
  notes: z.string().optional(),
  trackingCode: z.string().optional(),
  logisticsType: z.enum(["personal", "network", "pickup"]).optional(),
  logisticsDetails: z.record(z.unknown()).optional(),
});

export const GET = withSeller(async (req, { user, params }) => {
  const { id } = await params;

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);

  return ok(order);
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

  return ok(updated);
});
