import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { readProductDetails } from "@shared/product-types";
import { prepareVariantSave } from "@shared/product-variants";

// The product type, details, versions and related products as the product API saves them (POST / PATCH
// /api/store/products, Peggy's set_product_variants). Versions are checked and normalized by shared/product-variants;
// related products must be the store's own (never the product itself), at most 8, in the order picked.

export interface ProductFieldsInput {
  productType?: string | null;
  productDetails?: Record<string, string>;
  relatedProductIds?: string[];
  variants?: unknown;
  variantOptions?: unknown;
  variantUpdates?: Array<{ id: string; price?: number | null; stock?: number | null; enabled?: boolean }>;
}

export async function productFieldsData(
  storeId: string,
  input: ProductFieldsInput,
  stored: { id?: string; variants?: unknown; variantOptions?: unknown; inventoryType?: string | null },
): Promise<{ ok: true; data: Prisma.StoreProductUncheckedUpdateInput } | { ok: false; error: string }> {
  const data: Prisma.StoreProductUncheckedUpdateInput = {};
  if (input.productType !== undefined) data.productType = input.productType === "other" ? null : input.productType;
  if (input.productDetails !== undefined) data.productDetails = readProductDetails(input.productDetails);
  if (input.relatedProductIds !== undefined) {
    const wanted = [...new Set(input.relatedProductIds)].filter((id) => id !== stored.id).slice(0, 8);
    const found = wanted.length
      ? await db.storeProduct.findMany({ where: { storeId, id: { in: wanted }, status: { not: "archived" } }, select: { id: true } })
      : [];
    const ok = new Set(found.map((row) => row.id));
    data.relatedProductIds = wanted.filter((id) => ok.has(id));
  }
  const variants = prepareVariantSave({ variants: input.variants, variantOptions: input.variantOptions, variantUpdates: input.variantUpdates }, stored);
  if (!variants.ok) return variants;
  if (variants.data.variants) data.variants = variants.data.variants as unknown as Prisma.InputJsonValue;
  if (variants.data.variantOptions) data.variantOptions = variants.data.variantOptions as unknown as Prisma.InputJsonValue;
  if (variants.data.currentStock !== undefined) data.currentStock = variants.data.currentStock;
  return { ok: true, data };
}
