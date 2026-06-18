import { NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { toCsv } from "@/lib/csv";
import type { AuthUser } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true } });
  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const products = await db.storeProduct.findMany({
    where: { storeId: store.id },
    include: {
      supplierProduct: {
        include: {
          supplier: { select: { displayName: true } },
          category: { select: { name: true } },
        },
      },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const csv = toCsv([
    ["id", "name", "description", "sku", "retailPrice", "costPrice", "currency", "fulfillmentType", "status", "category", "supplier", "createdAt"],
    ...products.map((product) => [
      product.id,
      product.name,
      product.description ?? "",
      product.sku ?? "",
      product.retailPrice,
      product.costPrice ?? "",
      product.currency,
      product.fulfillmentType,
      product.status,
      product.category?.name ?? product.supplierProduct?.category?.name ?? "",
      product.supplierProduct?.supplier?.displayName ?? "",
      product.createdAt.toISOString(),
    ]),
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${store.slug}-products.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
