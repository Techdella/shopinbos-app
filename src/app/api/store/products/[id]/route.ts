import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import { StoreProductUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { productFieldsData } from "@/lib/products/save-fields.server";
import { stockTrackingFor } from "@shared/product-stock";
import { isShortCodeClash } from "@shared/product-codes";

async function getOwnedProduct(productId: string, userId: string) {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return null;
  return db.storeProduct.findUnique({
    where: { id: productId, storeId: store.id },
  });
}

export const GET = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);
  return ok(product);
});

export const PATCH = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = StoreProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // The update schema is the create schema made partial, and Zod still fills in defaults (images: [],
  // faqs: []...) for missing keys. Only apply the fields the client actually sent.
  const sent = new Set(body && typeof body === "object" ? Object.keys(body) : []);
  const { costPrice, retailPrice, productType, productDetails, relatedProductIds, variants, variantOptions, variantUpdates, ...rest } = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => sent.has(key)),
  ) as typeof parsed.data;

  // Type, details, versions (checked and normalized; the phone sends price/stock updates) and related products.
  const fields = await productFieldsData(
    product.storeId,
    { productType, productDetails, relatedProductIds, variants, variantOptions, variantUpdates },
    { id: product.id, variants: product.variants, variantOptions: product.variantOptions, inventoryType: rest.inventoryType ?? product.inventoryType },
  );
  if (!fields.ok) return apiError("BAD_REQUEST", fields.error);

  const effectiveCost = costPrice ?? product.costPrice;
  const effectivePrice = retailPrice ?? product.retailPrice;

  const margin =
    effectiveCost != null && effectivePrice > 0
      ? parseFloat((((effectivePrice - effectiveCost) / effectivePrice) * 100).toFixed(2))
      : undefined;

  // "Track stock": the seller's choice, else switched on when a count above 0 arrives (the phone, older clients).
  const versionTotal = typeof fields.data.currentStock === "number" ? fields.data.currentStock : undefined;
  const trackStock = stockTrackingFor({ trackStock: rest.trackStock, currentStock: versionTotal ?? rest.currentStock }, { trackStock: product.trackStock });

  let updated;
  try {
    updated = await db.storeProduct.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...fields.data,
        ...(trackStock !== undefined ? { trackStock } : {}),
        ...(costPrice !== undefined ? { costPrice } : {}),
        ...(retailPrice !== undefined ? { retailPrice } : {}),
        ...(margin !== undefined ? { margin } : {}),
      },
    });
  } catch (error) {
    // The short code is unique in the store: say which code clashed instead of a server error.
    if (rest.shortCode && isShortCodeClash(error)) return apiError("CODE_TAKEN", `Another product already uses the code ${rest.shortCode}. Pick a different one.`, 409);
    throw error;
  }

  await markCatalogDirty(product.storeId);
  return ok(updated);
});

export const DELETE = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  await db.storeProduct.update({
    where: { id: params.id },
    data: { status: "archived" },
  });

  await markCatalogDirty(product.storeId);
  return noContent();
});
