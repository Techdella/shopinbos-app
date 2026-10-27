import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { saleBreakdown } from "@/lib/marketplace/find";
import { editableVariantRows, productKind, tracksStock } from "@shared/product-edit";
import { productTypeKey, readProductDetails } from "@shared/product-types";
import { normalizeVariants, readVariantOptions } from "@shared/product-variants";
import { storefrontProductUrl } from "@shared/product-codes";
import { storeUrl } from "@/lib/marketing/brand";
import { preorderDay, preorderState } from "@shared/preorder";

export const dynamic = "force-dynamic";

// One of the seller's products for the phone's product editor (apps/mobile/src/app/product/[id].tsx): the fields
// it edits, the versions (price and stock editable, saved as variantUpdates), the type and its details and, for
// dropship products, the supplier and what each sale leaves, and its category (categoryId + { id, name }).
// Also everything else the web form fills in (long description, specifications, FAQs, care / shipping / returns /
// warranty / support, tags, SKU, barcode, video, cost, weight, stock settings, SEO title) and the versions in full
// (variantOptions + variantRows) so the phone can add or remove sizes and colours (saved as variants + variantOptions).
// Saving and archiving go to PATCH / DELETE /api/store/products/[id], the same route and rules as the web form;
// pausing a dropship product goes to POST /api/mobile/dropship. Auth: Bearer (or the web session), role seller.
// Preorders (shared/preorder.ts): `preorder` { enabled, shipsOn (YYYY-MM-DD), limit, taken, note } for the form (saved
// as `preorder` through PATCH /api/store/products/[id]); dropship products can't take their own, so they carry the
// supplier's instead (`dropship.preorder`, a preorder state: ship date, places left, promise).

export const GET = withSeller(async (_req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true, customDomain: true } });
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
      productType: true,
      productDetails: true,
      careInstructions: true,
      warranty: true,
      longDescription: true,
      specifications: true,
      faqs: true,
      shippingInfo: true,
      returnPolicy: true,
      supportInfo: true,
      sku: true,
      shortCode: true,
      barcode: true,
      videoUrl: true,
      tags: true,
      costPrice: true,
      weight: true,
      weightUnit: true,
      featured: true,
      trackStock: true,
      continueSellingWhenOut: true,
      reservedStock: true,
      seoTitle: true,
      seoDescription: true,
      variantOptions: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      updatedAt: true,
      fulfillmentType: true,
      preorderEnabled: true,
      preorderShipsAt: true,
      preorderLimit: true,
      preorderTaken: true,
      preorderNote: true,
      dropship: {
        select: {
          id: true,
          status: true,
          supplier: { select: { userId: true, displayName: true, city: true } },
          supplierProduct: { select: { wholesalePrice: true, stockQuantity: true, preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true } },
        },
      },
    },
  });
  if (!product || product.status === "archived") return apiError("NOT_FOUND", "That product couldn't be found.", 404);

  const { dropship, variants, variantOptions, productType, productDetails, preorderEnabled, preorderShipsAt, preorderLimit, preorderTaken, preorderNote, ...rest } = product;
  const supplierListing = dropship?.supplierProduct;
  const variantRows = normalizeVariants(variants).map(({ sourceIndex: _sourceIndex, ...row }) => row);
  return ok({
    ...rest,
    variantOptions: readVariantOptions(variantOptions, variantRows),
    variantRows,
    // Its page on the storefront, for Share to WhatsApp (the message also names its short code).
    url: storefrontProductUrl(storeUrl(store), product.id),
    kind: productKind(product),
    tracksStock: tracksStock(product.inventoryType),
    variants: editableVariantRows(variants),
    productType: productTypeKey(productType),
    productDetails: readProductDetails(productDetails),
    preorder: { enabled: preorderEnabled, shipsOn: preorderDay(preorderShipsAt), limit: preorderLimit, taken: preorderTaken, note: preorderNote },
    dropship: dropship
      ? {
          relationshipId: dropship.id,
          paused: dropship.status === "paused",
          supplier: { userId: dropship.supplier.userId, name: dropship.supplier.displayName, city: dropship.supplier.city },
          cost: dropship.supplierProduct.wholesalePrice,
          supplierStock: dropship.supplierProduct.stockQuantity,
          sale: saleBreakdown(product.retailPrice, dropship.supplierProduct.wholesalePrice),
          // The supplier takes preorders on this listing (their date, places left and promise), or null.
          preorder: supplierListing?.preorderEnabled
            ? preorderState({ enabled: true, shipsAt: supplierListing.preorderShipsAt, limit: supplierListing.preorderLimit, taken: supplierListing.preorderTaken, note: supplierListing.preorderNote })
            : null,
        }
      : null,
  });
});
