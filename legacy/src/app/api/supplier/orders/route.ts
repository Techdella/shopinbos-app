import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { okList, apiError, parsePagination } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get("status");

  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const where = {
    supplierId: supplier.id,
    ...(status ? { status: status as any } : {}),
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
        status: true, trackingCode: true, createdAt: true, updatedAt: true,
        seller: { select: { id: true, name: true, email: true } },
        supplierProduct: { select: { id: true, name: true, images: true } },
      },
    }),
  ]);

  return okList(orders, { page, limit, total });
});
