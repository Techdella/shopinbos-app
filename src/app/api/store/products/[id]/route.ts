import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import { StoreProductUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";

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
  const { costPrice, retailPrice, ...rest } = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => sent.has(key)),
  ) as typeof parsed.data;

  const effectiveCost = costPrice ?? product.costPrice;
  const effectivePrice = retailPrice ?? product.retailPrice;

  const margin =
    effectiveCost != null && effectivePrice > 0
      ? parseFloat((((effectivePrice - effectiveCost) / effectivePrice) * 100).toFixed(2))
      : undefined;

  const updated = await db.storeProduct.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(costPrice !== undefined ? { costPrice } : {}),
      ...(retailPrice !== undefined ? { retailPrice } : {}),
      ...(margin !== undefined ? { margin } : {}),
    },
  });

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
