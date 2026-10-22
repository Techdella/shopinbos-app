import { NextRequest } from "next/server";
import { PRODUCT_PLAN_FIRST } from "@/lib/plans/placement";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { nearbyForSeller } from "@/lib/marketplace/agreements.server";
import { productSelect, productWhere, sellerStore } from "./_shared";

export const dynamic = "force-dynamic";

// GET ?q= → { hasPlace, city, products }: Find products in the phone app, the same as the web's /marketplace: only
// suppliers near the seller for now (verified or not), each with its verification, risk score, distance and
// whether the seller already has a Dropship agreement with it (src/lib/marketplace/agreements.server.ts).
export const GET = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const rows = await db.supplierProduct.findMany({
    where: { ...productWhere(store.country || "Nigeria"), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) },
    select: productSelect,
    orderBy: [PRODUCT_PLAN_FIRST, { trendScore: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  const nearby = await nearbyForSeller(user.id, rows, new Map(rows.map((row) => [row.supplier.id, row.supplier.address])));
  return ok({ hasPlace: nearby.hasPlace, city: store.city, products: nearby.products.slice(0, 100).map(({ supplier: { address: _address, ...supplier }, ...row }) => ({ ...row, supplier })) });
});
