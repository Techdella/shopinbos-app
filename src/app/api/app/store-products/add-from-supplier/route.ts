import { NextRequest } from "next/server";
import { productLimitProblem } from "@/lib/plans/gates.server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { withShortCode } from "@/lib/products/short-code.server";
import { ok, apiError } from "@/lib/api/response";
import { AddFromSupplierSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { listingCheck } from "@/lib/marketplace/agreements.server";
import { ListingChoiceSchema, checkDropshipListing, skuFields } from "@/lib/marketplace/dropship-listing.server";

// POST { supplierProductId, retailPrice, fulfillmentType, deliveryPayer?, deliveryFlatFee?, sku?, barcode? }
// (a brandingChoice from an older client is ignored: every dropship parcel is packed plain). Dropship: the cost is
// the supplier's dropship price, the price can't go below its lowest allowed price or lose money on delivery the
// seller covers (409 PRICE_PROBLEM), and the choices are saved on the store product.

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = AddFromSupplierSchema.and(ListingChoiceSchema).safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supplierProductId, retailPrice, fulfillmentType } = parsed.data;

  const supplierProduct = await db.supplierProduct.findFirst({
    where: {
      id: supplierProductId,
      status: "published",
      supplier: {
        status: "active",
        verificationStatus: "verified",
      },
    },
    include: { supplier: { select: { id: true } } },
  });
  if (!supplierProduct) return apiError("NOT_FOUND", "Supplier product not found", 404);

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found. Complete onboarding first.", 404);
  if (fulfillmentType === "dropship") {
    const gate = await listingCheck(user.id, supplierProduct.supplierId);
    if (!gate.ok) return apiError(gate.code, gate.message, 409);
  }

  const planLimit = await productLimitProblem(user.id, store.id, 1, fulfillmentType === "dropship");
  if (planLimit) return apiError("PLAN_LIMIT", planLimit, 402);
  const check = fulfillmentType === "dropship" ? await checkDropshipListing(supplierProduct, user.id, parsed.data) : null;
  if (check && !check.ok) return apiError(check.code, check.message, 409);
  const costPrice = check?.ok ? check.costPrice : supplierProduct.wholesalePrice;
  const margin = Math.round(((retailPrice - costPrice) / retailPrice) * 100);

  const storeProduct = await withShortCode(store.id, { name: supplierProduct.name, categoryId: supplierProduct.categoryId }, (shortCode) => db.storeProduct.create({
    data: {
      storeId: store.id,
      userId: user.id,
      supplierProductId,
      name: supplierProduct.name,
      shortCode,
      description: supplierProduct.description,
      images: supplierProduct.images,
      retailPrice,
      costPrice,
      currency: supplierProduct.currency,
      margin,
      fulfillmentType,
      ...(check?.ok ? { deliveryPayer: check.deliveryPayer, deliveryFlatFee: check.deliveryFlatFee } : {}),
      ...skuFields(parsed.data),
      status: "published",
    },
  }));
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "product_added", ref: storeProduct.id })).catch(() => undefined);

  if (fulfillmentType === "dropship") {
    await db.dropshipRelationship.create({
      data: {
        sellerId: user.id,
        storeId: store.id,
        supplierId: supplierProduct.supplierId,
        supplierProductId,
        storeProductId: storeProduct.id,
      },
    });
  }

  await markCatalogDirty(store.id);
  return ok(storeProduct, 201);
});
