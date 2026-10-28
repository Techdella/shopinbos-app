import { NextRequest } from "next/server";
import { PRODUCT_PLAN_FIRST } from "@/lib/plans/placement";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { nearbyForSeller } from "@/lib/marketplace/agreements.server";
import { sameState, sellerState } from "@/lib/marketplace/quick-add.server";
import { productSelect, productWhere, sellerStore, withPreorderState } from "./_shared";

export const dynamic = "force-dynamic";

// GET ?q= → { hasPlace, city, state, products } (up to 300; the app lists them virtualised): Find products in the phone app, the same as the web's /marketplace: only
// suppliers near the seller for now (verified or not), each with its verification, risk score, distance and
// whether the seller already has a Dropship agreement with it (src/lib/marketplace/agreements.server.ts), and
// `preorder` when the supplier takes preorders (ship date, places left, promise; never the raw counts), the
// seller's `state` and, per supplier, `sameState` (in the seller's state), and the channel prices the one-tap price
// needs (priceMode, dropshipPrice, minRetailPrice).
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
  const [nearby, state] = await Promise.all([nearbyForSeller(user.id, rows, new Map(rows.map((row) => [row.supplier.id, row.supplier.address]))), sellerState(user.id)]);
  // `supplier.sameState`: the supplier is in the seller's state ("Delivers to my state" filter).
  return ok({
    hasPlace: nearby.hasPlace,
    city: store.city,
    state,
    products: nearby.products.slice(0, 300).map(({ supplier: { address, ...supplier }, ...row }) => ({ ...withPreorderState(row), supplier: { ...supplier, sameState: sameState(state, { city: supplier.city, address }) } })),
  });
});
