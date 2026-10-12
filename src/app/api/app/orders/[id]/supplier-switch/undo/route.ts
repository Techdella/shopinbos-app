import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { orderRow } from "@/lib/dashboard/compute";
import { sellerPartsView } from "@/lib/supplier-orders/parts.server";
import { undoSupplierSwitch } from "@/lib/supplier-orders/switch.server";

// "Undo" on an automatic switch to another supplier (web order page and the app), until the new supplier accepts.
// Only the seller's own store's orders.
const Body = z.object({ supplierOrderId: z.string().min(1).max(64) });

export const POST = withSeller(async (req, { user, params }) => {
  const { id } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which switch to undo.");
  const replacement = await db.supplierOrder.findFirst({ where: { id: parsed.data.supplierOrderId, retailOrderId: id, storeId: store.id }, select: { id: true } });
  if (!replacement) return apiError("NOT_FOUND", "We couldn't find that switch. Refresh to see the order.", 404);
  const result = await undoSupplierSwitch(store.id, replacement.id);
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);
  const parts = await sellerPartsView(order.id, store.id).catch(() => null);
  return ok({ ...order, parts, row: orderRow({ ...order, total: Number(order.total) }) });
});
