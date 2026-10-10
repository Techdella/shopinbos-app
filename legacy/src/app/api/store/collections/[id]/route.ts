import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError, noContent } from "@/lib/api/response";
import { CollectionUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

async function getOwnedCollection(collectionId: string, userId: string) {
  const store = await db.store.findUnique({ where: { userId } });
  if (!store) return null;
  return db.collection.findUnique({
    where: { id: collectionId, storeId: store.id },
    include: {
      products: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: true,
              retailPrice: true,
              currency: true,
              status: true,
              visibility: true,
            },
          },
        },
      },
      _count: { select: { products: true } },
    },
  });
}

export const GET = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const collection = await getOwnedCollection(params.id, user.id);
  if (!collection) return apiError("NOT_FOUND", "Collection not found", 404);
  return ok(collection);
});

export const PATCH = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const existing = await db.collection.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Collection not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = CollectionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { productIds, ...data } = parsed.data;

  const collection = await db.collection.update({
    where: { id: params.id },
    data: {
      ...data,
      ...(productIds
        ? {
            products: {
              deleteMany: {},
              create: productIds.map((productId, index) => ({
                productId,
                sortOrder: index,
              })),
            },
          }
        : {}),
    },
    include: {
      products: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: true,
              retailPrice: true,
              currency: true,
              status: true,
              visibility: true,
            },
          },
        },
      },
      _count: { select: { products: true } },
    },
  });

  return ok(collection);
});

export const DELETE = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const existing = await db.collection.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!existing) return apiError("NOT_FOUND", "Collection not found", 404);

  await db.collection.delete({ where: { id: params.id } });
  return noContent();
});
