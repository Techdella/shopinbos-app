import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { AddFromSupplierSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { trackProductAdded } from "@/lib/platform-analytics/seller-events.server";

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = AddFromSupplierSchema.safeParse(body);
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

  const costPrice = supplierProduct.wholesalePrice;
  const margin = Math.round(((retailPrice - costPrice) / retailPrice) * 100);

  const storeProduct = await db.storeProduct.create({
    data: {
      storeId: store.id,
      userId: user.id,
      supplierProductId,
      name: supplierProduct.name,
      description: supplierProduct.description,
      images: supplierProduct.images,
      retailPrice,
      costPrice,
      currency: supplierProduct.currency,
      margin,
      fulfillmentType,
      status: "published",
    },
  });
  trackProductAdded({ userId: user.id, source: "supplier", fromSupplier: true });

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
