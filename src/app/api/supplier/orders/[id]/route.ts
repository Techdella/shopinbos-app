import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { moveSupplierOrder } from "@/lib/supplier-orders/service.server";
import { moveWholesaleOrder } from "@/lib/supplier-orders/wholesale.server";
import { listDropshipOrders } from "@/lib/supplier-orders/views.server";

export const dynamic = "force-dynamic";

// One supplier order. GET ?kind=dropship|wholesale. PATCH { kind, action, trackingCode?, carrier?, reason? }:
//   accept · ship (with tracking) · deliver · reject (with a reason). Only the supplier's own orders.

const SupplierOrderMoveSchema = z.object({
  kind: z.enum(["dropship", "wholesale"]),
  action: z.enum(["accept", "ship", "deliver", "reject"]),
  trackingCode: z.string().trim().max(80).optional(),
  carrier: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(500).optional(),
});

const WHOLESALE_SELECT = {
  id: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, deliveryAddress: true, notes: true,
  status: true, trackingCode: true, rejectReason: true, shippedAt: true, deliveredAt: true, createdAt: true, updatedAt: true,
  seller: { select: { id: true, name: true, email: true } },
  supplierProduct: { select: { id: true, name: true, images: true } },
} as const;

async function findOrder(supplierId: string, kind: string, id: string) {
  if (kind === "wholesale") return db.wholesaleOrder.findFirst({ where: { id, supplierId }, select: WHOLESALE_SELECT });
  const { orders } = await listDropshipOrders(supplierId, { id, take: 1 });
  return orders[0] ?? null;
}

export const GET = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const kind = req.nextUrl.searchParams.get("kind") === "wholesale" ? "wholesale" : "dropship";
  const order = await findOrder(supplier.id, kind, String(params.id));
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);
  return ok(order);
});

export const PATCH = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (!isOnboardingComplete(supplier) || supplier.verificationStatus !== "verified") {
    return apiError("VERIFICATION_REQUIRED", "Finish setting up and get verified before you ship orders.", 403);
  }
  const parsed = SupplierOrderMoveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Say what to do with this order.");
  const { kind, action, trackingCode, carrier, reason } = parsed.data;
  const id = String(params.id);

  const result = kind === "wholesale"
    ? await moveWholesaleOrder({ supplierId: supplier.id, orderId: id, action, trackingCode, reason })
    : await moveSupplierOrder({ supplierId: supplier.id, orderId: id, action, trackingCode, carrier, reason });
  if (!result.ok) return apiError(result.code, result.message);
  return ok(await findOrder(supplier.id, kind, id));
});
