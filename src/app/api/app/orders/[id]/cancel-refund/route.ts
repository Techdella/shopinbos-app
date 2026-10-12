import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { orderRow } from "@/lib/dashboard/compute";
import { sellerPartsView } from "@/lib/supplier-orders/parts.server";
import { cancelAndRefundAfterExpiry } from "@/lib/supplier-orders/seller-choices.server";

// "Cancel and refund the customer" when a supplier didn't accept in time and nobody took it over (the app; the web
// page uses the same rules through a server action). Only the seller's own store's orders.
export const POST = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const result = await cancelAndRefundAfterExpiry(store, id);
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : 409);
  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);
  const parts = await sellerPartsView(order.id, store.id).catch(() => null);
  return ok({ ...order, parts, message: result.message, row: orderRow({ ...order, total: Number(order.total) }) });
});
