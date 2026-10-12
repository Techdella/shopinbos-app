import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { updateOrderStatus } from "@/lib/orders/update-status";
import { statusAfter } from "../../_rules";
import { WHOLESALE_SELECT, canTrade, dropshipOrders, supplierForUser, wholesaleView } from "../../_shared";

export const dynamic = "force-dynamic";

// One supplier order in the mobile app (?kind=dropship | wholesale).
// GET → the order with its label / packing slip details. PATCH { kind, action, trackingCode? } moves it:
//   accept · decline (wholesale only) · packed · handed_over (to the rider; optional tracking code).
// Dropship orders move through the same status change the seller's app uses (updateOrderStatus), so the buyer
// gets the usual "packed" / "on its way" messages; a mixed order (other products too) stays the seller's to move.

const Body = z.object({
  kind: z.enum(["dropship", "wholesale"]),
  action: z.enum(["accept", "decline", "packed", "handed_over"]),
  trackingCode: z.string().trim().max(80).optional(),
});

async function findOrder(supplierId: string, kind: string, id: string) {
  if (kind === "wholesale") {
    const order = await db.wholesaleOrder.findFirst({ where: { id, supplierId }, select: WHOLESALE_SELECT });
    return order ? wholesaleView(order) : null;
  }
  const [order] = await dropshipOrders(supplierId, { orderId: id });
  return order ?? null;
}

export const GET = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const order = await findOrder(supplier.id, req.nextUrl.searchParams.get("kind") ?? "dropship", String(params.id));
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);
  return ok(order);
});

export const PATCH = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (!canTrade(supplier)) return apiError("VERIFICATION_REQUIRED", "Finish setting up and get verified before you ship orders.", 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say what to do with this order.");
  const { kind, action, trackingCode } = parsed.data;
  const id = String(params.id);

  if (kind === "wholesale") {
    const order = await db.wholesaleOrder.findFirst({ where: { id, supplierId: supplier.id }, select: { id: true, status: true } });
    if (!order) return apiError("NOT_FOUND", "Order not found", 404);
    const status = statusAfter("wholesale", order.status, action);
    if (!status) return apiError("CONFLICT", "This order has already moved on. Pull down to refresh.", 409);
    // Only move it if nobody else did in the meantime.
    const moved = await db.wholesaleOrder.updateMany({
      where: { id: order.id, status: order.status as never },
      data: { status: status as never, ...(trackingCode ? { trackingCode } : {}) },
    });
    if (moved.count === 0) return apiError("CONFLICT", "This order has already moved on. Pull down to refresh.", 409);
    return ok(await findOrder(supplier.id, kind, id));
  }

  const [view] = await dropshipOrders(supplier.id, { orderId: id });
  if (!view) return apiError("NOT_FOUND", "Order not found", 404);
  const status = statusAfter("dropship", view.status, action, { mixed: view.mixed });
  if (!status) {
    return apiError("CONFLICT", view.mixed ? "This order has other products too, so the shop moves it. Message them." : "This order has already moved on. Pull down to refresh.", 409);
  }
  const order = await db.retailOrder.findUnique({ where: { id } });
  const store = order ? await db.store.findUnique({ where: { id: order.storeId }, select: { id: true, name: true } }) : null;
  if (!order || !store) return apiError("NOT_FOUND", "Order not found", 404);
  const result = await updateOrderStatus(store, order, { status: status as "processing" | "packed" | "shipped", ...(trackingCode ? { trackingCode } : {}) });
  if (!result.ok) return apiError("CONFLICT", result.error, 409);
  return ok(await findOrder(supplier.id, kind, id));
});
