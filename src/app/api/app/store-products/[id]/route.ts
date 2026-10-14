import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { saleBreakdown } from "@/lib/marketplace/find";
import { productKind, tracksStock, variantRows } from "@shared/product-edit";

export const dynamic = "force-dynamic";

// One of the seller's products for the phone's product editor (apps/mobile/src/app/product/[id].tsx): the fields
// it edits, the variants (read-only) and, for dropship products, the supplier and what each sale leaves.
// Saving and archiving go to PATCH / DELETE /api/store/products/[id], the same route and rules as the web form;
// pausing a dropship product goes to POST /api/mobile/dropship. Auth: Bearer (or the web session), role seller.

export const GET = withSeller(async (_req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "That product couldn't be found.", 404);

  const product = await db.storeProduct.findFirst({
    where: { id: params.id, storeId: store.id },
    select: {
      id: true,
      name: true,
      description: true,
      images: true,
      retailPrice: true,
      compareAtPrice: true,
      currentStock: true,
      lowStockThreshold: true,
      status: true,
      inventoryType: true,
      variants: true,
      updatedAt: true,
      dropship: {
        select: {
          id: true,
          status: true,
          supplier: { select: { userId: true, displayName: true, city: true } },
          supplierProduct: { select: { wholesalePrice: true, stockQuantity: true } },
        },
      },
    },
  });
  if (!product || product.status === "archived") return apiError("NOT_FOUND", "That product couldn't be found.", 404);

  const { dropship, variants, ...rest } = product;
  return ok({
    ...rest,
    kind: productKind(product),
    tracksStock: tracksStock(product.inventoryType),
    variants: variantRows(variants),
    dropship: dropship
      ? {
          relationshipId: dropship.id,
          paused: dropship.status === "paused",
          supplier: { userId: dropship.supplier.userId, name: dropship.supplier.displayName, city: dropship.supplier.city },
          cost: dropship.supplierProduct.wholesalePrice,
          supplierStock: dropship.supplierProduct.stockQuantity,
          sale: saleBreakdown(product.retailPrice, dropship.supplierProduct.wholesalePrice),
        }
      : null,
  });
});
