import { NextRequest, NextResponse } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { toCsv } from "@/lib/csv";
import { planOfUser } from "@/lib/plan-limits";
import { supplierLimits } from "@shared/plans";

export const dynamic = "force-dynamic";

// GET /api/supplier/analytics/export: the supplier's wholesale orders (latest 10,000) as CSV. Pro plan only.
export const GET = withSupplier(async (_req: NextRequest, { user }) => {
  if (supplierLimits(await planOfUser(user.id)).analytics !== "export") return apiError("PLAN_LIMIT", "Spreadsheet downloads come with the Supplier Pro plan.", 402);
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const orders = await db.wholesaleOrder.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 10_000,
    include: { seller: { select: { name: true } }, supplierProduct: { select: { name: true } } },
  });
  const csv = toCsv([
    ["Date", "Order", "Product", "Seller", "Quantity", "Total (NGN)", "Status"],
    ...orders.map((order) => [order.createdAt.toISOString(), order.id, order.supplierProduct?.name ?? "", order.seller?.name ?? "", order.quantity, Number(order.totalPrice), order.status]),
  ]);
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="shopinbos-orders-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
