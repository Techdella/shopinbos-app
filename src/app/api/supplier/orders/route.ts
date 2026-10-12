import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { okList, apiError, parsePagination } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { OrderStatusSchema } from "@/lib/schemas";
import { SUPPLIER_ORDER_STATUSES } from "@/lib/supplier-orders/pure";
import { listDropshipOrders } from "@/lib/supplier-orders/views.server";

// The supplier's orders. ?kind=wholesale (default: sellers buying stock, WholesaleOrder) or ?kind=dropship (store
// orders they ship for sellers, SupplierOrder). ?status= filters. Moving one: PATCH ./[id].

export const GET = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const kind = req.nextUrl.searchParams.get("kind") ?? "wholesale";
  const rawStatus = req.nextUrl.searchParams.get("status");
  if (kind !== "wholesale" && kind !== "dropship") return apiError("BAD_REQUEST", "kind must be wholesale or dropship");

  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  if (kind === "dropship") {
    if (rawStatus && !(SUPPLIER_ORDER_STATUSES as readonly string[]).includes(rawStatus)) return apiError("BAD_REQUEST", "Unknown status");
    const { orders, total } = await listDropshipOrders(supplier.id, { statuses: rawStatus ? [rawStatus] : undefined, skip, take: limit });
    return okList(orders, { page, limit, total });
  }

  const status = rawStatus ? OrderStatusSchema.safeParse(rawStatus) : null;
  if (status && !status.success) return apiError("BAD_REQUEST", "Unknown status");
  const where = {
    supplierId: supplier.id,
    ...(status?.success ? { status: status.data } : {}),
  };

  const [total, orders] = await Promise.all([
    db.wholesaleOrder.count({ where }),
    db.wholesaleOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, quantity: true, unitPrice: true, totalPrice: true,
        currency: true, deliveryAddress: true, notes: true,
        status: true, trackingCode: true, rejectReason: true, shippedAt: true, deliveredAt: true, createdAt: true, updatedAt: true,
        seller: { select: { id: true, name: true, email: true } },
        supplierProduct: { select: { id: true, name: true, images: true } },
      },
    }),
  ]);

  return okList(orders, { page, limit, total });
});
