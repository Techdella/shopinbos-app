import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

async function getOwnedCollection(collectionId: string, userId: string) {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return null;
  return db.collection.findUnique({
    where: { id: collectionId, storeId: store.id },
  });
}

export const POST = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const collection = await getOwnedCollection(params.id, user.id);
  if (!collection) return apiError("NOT_FOUND", "Collection not found", 404);

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.productIds) || body.productIds.length === 0) {
    return apiError("BAD_REQUEST", "productIds must be a non-empty array");
  }

  const productIds: string[] = body.productIds;

  const existingProducts = await db.collectionProduct.findMany({
    where: { collectionId: params.id, productId: { in: productIds } },
    select: { productId: true },
  });
  const existingSet = new Set(existingProducts.map((p) => p.productId));
  const newIds = productIds.filter((id) => !existingSet.has(id));

  if (newIds.length > 0) {
    const lastProduct = await db.collectionProduct.findFirst({
      where: { collectionId: params.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextSortOrder = (lastProduct?.sortOrder ?? -1) + 1;

    await db.collectionProduct.createMany({
      data: newIds.map((productId) => ({
        collectionId: params.id,
        productId,
        sortOrder: nextSortOrder++,
      })),
    });
  }

  const updated = await db.collection.findUnique({
    where: { id: params.id },
    include: { _count: { select: { products: true } } },
  });

  return ok({ ...updated, productCount: updated!._count.products, _count: undefined });
});

export const DELETE = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const collection = await getOwnedCollection(params.id, user.id);
  if (!collection) return apiError("NOT_FOUND", "Collection not found", 404);

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.productIds) || body.productIds.length === 0) {
    return apiError("BAD_REQUEST", "productIds must be a non-empty array");
  }

  const { count } = await db.collectionProduct.deleteMany({
    where: {
      collectionId: params.id,
      productId: { in: body.productIds },
    },
  });

  if (count === 0) return apiError("NOT_FOUND", "No matching products found in collection", 404);

  return noContent();
});
