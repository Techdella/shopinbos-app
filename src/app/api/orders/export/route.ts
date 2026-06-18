import { NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { toCsv } from "@/lib/csv";
import type { AuthUser } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

function itemCount(items: unknown) {
  return Array.isArray(items) ? items.length : 0;
}

export const GET = withSeller(async (_req, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true } });
  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const orders = await db.retailOrder.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
  });

  const csv = toCsv([
    [
      "id",
      "orderNumber",
      "buyerName",
      "buyerEmail",
      "buyerPhone",
      "itemCount",
      "subtotal",
      "shippingFee",
      "discountCode",
      "discountAmount",
      "total",
      "currency",
      "status",
      "paystackStatus",
      "createdAt",
    ],
    ...orders.map((order) => [
      order.id,
      order.orderNumber,
      order.buyerName,
      order.buyerEmail,
      order.buyerPhone ?? "",
      itemCount(order.items),
      order.subtotal,
      order.shippingFee,
      order.discountCode ?? "",
      order.discountAmount ?? 0,
      order.total,
      order.currency,
      order.status,
      order.paystackStatus ?? "",
      order.createdAt.toISOString(),
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${store.slug}-orders.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
