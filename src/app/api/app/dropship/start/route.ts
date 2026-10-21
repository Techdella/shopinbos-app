import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { StartDropshipSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { listingCheck } from "@/lib/marketplace/agreements.server";

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = StartDropshipSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { supplierProductId, retailPrice } = parsed.data;

  const supplierProduct = await db.supplierProduct.findFirst({
    where: {
      id: supplierProductId,
      status: "published",
      dropshipAvailable: true,
      supplier: {
        status: "active",
        verificationStatus: "verified",
      },
    },
  });
  if (!supplierProduct) return apiError("NOT_FOUND", "Dropship product not found", 404);

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found. Complete onboarding first.", 404);
  const gate = await listingCheck(user.id, supplierProduct.supplierId);
  if (!gate.ok) return apiError(gate.code, gate.message, 409);

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
      fulfillmentType: "dropship",
      status: "draft",
    },
  });
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "product_added", ref: storeProduct.id })).catch(() => undefined);

  const relationship = await db.dropshipRelationship.create({
    data: {
      sellerId: user.id,
      storeId: store.id,
      supplierId: supplierProduct.supplierId,
      supplierProductId,
      storeProductId: storeProduct.id,
    },
  });

  return ok({ storeProduct, relationship }, 201);
});
