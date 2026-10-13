import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { moveSupplierOrder } from "@/lib/supplier-orders/service.server";
import { moveWholesaleOrder } from "@/lib/supplier-orders/wholesale.server";
import { portalAction, statusAfter } from "../../_rules";
import { markPacked } from "@/lib/supplier-orders/pickup.server";
import { WHOLESALE_SELECT, canTrade, dropshipOrders, supplierForUser, wholesaleViews } from "../../_shared";

export const dynamic = "force-dynamic";

// One supplier order in the mobile app (?kind=dropship | wholesale).
// GET → the order with its label / packing slip details. PATCH { kind, action, trackingCode?, reason? } moves it:
//   accept · decline (optional reason) · packed (wholesale only) · handed_over (to the rider; optional tracking
//   code) · delivered. Dropship and wholesale moves go through the same code as the web portal
//   (src/lib/supplier-orders), so the shop is told and the shop's own order follows a shipped dropship order.

const Body = z.object({
  kind: z.enum(["dropship", "wholesale"]),
  action: z.enum(["accept", "decline", "packed", "handed_over", "delivered"]),
  trackingCode: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(500).optional(),
});

const APP_DECLINE_REASON = "Declined from the Shopinbos app";

async function findOrder(supplierId: string, kind: string, id: string) {
  if (kind === "wholesale") {
    const order = await db.wholesaleOrder.findFirst({ where: { id, supplierId }, select: WHOLESALE_SELECT });
    return order ? (await wholesaleViews([order]))[0] : null;
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
  const reason = parsed.data.reason || APP_DECLINE_REASON;
  const id = String(params.id);

  if (action === "packed") {
    // "I've packed it": a bulk order moves confirmed → processing; a shop's order keeps packedAt and stays accepted
    // until the rider (booked next, POST /api/supplier/orders/[id]/pickup) has it.
    if (kind === "wholesale") {
      const order = await db.wholesaleOrder.findFirst({ where: { id, supplierId: supplier.id }, select: { id: true, status: true } });
      if (!order) return apiError("NOT_FOUND", "Order not found", 404);
      if (!statusAfter("wholesale", order.status, action)) return apiError("CONFLICT", "This order has already moved on. Pull down to refresh.", 409);
    }
    const packed = await markPacked(supplier.id, kind, id);
    if (!packed.ok) return apiError(packed.code, packed.code === "CONFLICT" ? "This order has already moved on. Pull down to refresh." : packed.message, packed.code === "NOT_FOUND" ? 404 : packed.code === "CONFLICT" ? 409 : 400);
    return ok(await findOrder(supplier.id, kind, id));
  }

  const move = portalAction(action);
  if (!move) return apiError("BAD_REQUEST", "That can't be done to this order.");
  const result = kind === "wholesale"
    ? await moveWholesaleOrder({ supplierId: supplier.id, orderId: id, action: move, trackingCode, reason })
    : await moveSupplierOrder({ supplierId: supplier.id, orderId: id, action: move, trackingCode, reason });
  if (!result.ok) {
    if (result.code === "CONFLICT") return apiError("CONFLICT", result.message.startsWith("Time ran out") ? result.message : "This order has already moved on. Pull down to refresh.", 409);
    return apiError(result.code, result.message);
  }
  return ok(await findOrder(supplier.id, kind, id));
});
