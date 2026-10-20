import { NextRequest } from "next/server";
import { productLimitProblem } from "@/lib/plans/gates.server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { mergeBrandSettings } from "@/lib/workspace";
import { VISIBLE_SUPPLIER, listingCheck } from "@/lib/marketplace/agreements.server";

export const dynamic = "force-dynamic";

// Find products in the mobile app. The product cards read /api/public/products; this route adds what only the
// signed-in seller has:
//   GET  → { country, destination, addedIds }: the store's country (which suppliers to show), where wholesale
//          quotes ship to, and the supplier products already in the store.
//   POST { supplierProductId, retailPrice? } → { storeProductId, already }: "Add to store", the same as the web's
//          addSupplierProductToStore action: a draft product linked to the supplier (dropship when offered),
//          never a duplicate.

/** Same floor and ceiling as the web's price stepper (src/lib/marketplace/find.ts clampSellingPrice). */
function clampSellingPrice(price: number, cost: number) {
  const fee = cost > 0 ? Math.round(Math.min(cost * 0.015 + (cost >= 2500 ? 100 : 0), 2000)) : 0;
  const floor = Math.ceil((cost + fee + 100) / 100) * 100;
  const ceiling = Math.max(floor, Math.round(cost * 10));
  return Math.min(ceiling, Math.max(floor, Math.round(price)));
}

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, city: true, country: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const added = await db.storeProduct.findMany({ where: { storeId: store.id, supplierProductId: { not: null } }, select: { supplierProductId: true } });
  return ok({
    country: store.country || "Nigeria",
    destination: [store.city, store.country].filter(Boolean).join(", ") || "Nigeria",
    addedIds: added.map((row) => row.supplierProductId).filter((id): id is string => Boolean(id)),
  });
});

const AddSchema = z.object({ supplierProductId: z.string().min(1).max(64), retailPrice: z.number().positive().max(100_000_000).optional() });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "That product couldn't be added.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);

  const product = await db.supplierProduct.findFirst({
    where: { id: parsed.data.supplierProductId, status: "published", supplier: VISIBLE_SUPPLIER },
    include: { supplier: { select: { verificationStatus: true } } },
  });
  if (!product) return apiError("NOT_FOUND", "This product isn't available any more.", 404);
  const existing = await db.storeProduct.findFirst({ where: { storeId: store.id, supplierProductId: product.id }, select: { id: true } });
  if (existing) return ok({ storeProductId: existing.id, already: true });

  // The same checks as the web (src/lib/marketplace/agreements.server.ts): dropship needs the agreement.
  if (product.dropshipAvailable) {
    const gate = await listingCheck(user.id, product.supplierId);
    if (!gate.ok) return apiError(gate.code, gate.message, 409);
  } else if (product.supplier.verificationStatus !== "verified") {
    return apiError("NOT_AVAILABLE", "Buy stock only from verified suppliers. This one isn't verified yet.", 409);
  }


  const retailPrice = clampSellingPrice(parsed.data.retailPrice ?? product.suggestedRetailPrice, product.wholesalePrice);
  const dropship = product.dropshipAvailable;
  const planLimit = await productLimitProblem(user.id, store.id, 1, dropship);
  if (planLimit) return apiError("PLAN_LIMIT", planLimit, 402);
  const storeProduct = await db.storeProduct.create({
    data: {
      storeId: store.id,
      userId: user.id,
      supplierProductId: product.id,
      name: product.name,
      description: product.description,
      images: product.images,
      retailPrice,
      costPrice: product.wholesalePrice,
      currency: product.currency,
      margin: retailPrice - product.wholesalePrice,
      categoryId: product.categoryId,
      fulfillmentType: dropship ? "dropship" : "merchant_fulfilled",
      inventoryType: dropship ? "dropshipping" : "seller",
      sourceType: dropship ? "dropship" : "supplier",
      supplierStock: product.stockQuantity,
      supplierLastSync: new Date(),
      status: "draft",
    },
  });
  if (dropship) {
    await db.dropshipRelationship.create({
      data: { sellerId: user.id, storeId: store.id, supplierId: product.supplierId, supplierProductId: product.id, storeProductId: storeProduct.id },
    });
  }
  await db.store.update({ where: { id: store.id }, data: { brandSettings: mergeBrandSettings(store.brandSettings, { setup: { productAdded: true } }) } });
  return ok({ storeProductId: storeProduct.id, already: false }, 201);
});
