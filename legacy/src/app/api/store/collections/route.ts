import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { CollectionCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);

  const where = { storeId: store.id };

  const [total, collections] = await Promise.all([
    db.collection.count({ where }),
    db.collection.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      skip,
      take: limit,
      include: {
        _count: { select: { products: true } },
      },
    }),
  ]);

  const enriched = collections.map((c) => ({
    ...c,
    productCount: c._count.products,
    _count: undefined,
  }));

  return okList(enriched, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = CollectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { productIds, ...data } = parsed.data;

  const collection = await db.collection.create({
    data: {
      ...data,
      storeId: store.id,
      products: productIds.length > 0
        ? {
            create: productIds.map((productId, index) => ({
              productId,
              sortOrder: index,
            })),
          }
        : undefined,
    },
    include: {
      _count: { select: { products: true } },
    },
  });

  return ok(
    { ...collection, productCount: collection._count.products, _count: undefined },
    201
  );
});
