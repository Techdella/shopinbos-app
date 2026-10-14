import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { StoreProductCreateSchema, StoreProductQuerySchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { productFieldsData } from "@/lib/products/save-fields.server";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = StoreProductQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query params");
  }

  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const { status, visibility, inventoryType, categoryId, collectionId, q, featured, lowStock, sort } = parsed.data;

  const where: any = { storeId: store.id };

  if (status) where.status = status;
  if (visibility) where.visibility = visibility;
  if (inventoryType) where.inventoryType = inventoryType;
  if (categoryId) where.categoryId = categoryId;
  if (collectionId) where.collections = { some: { collectionId } };
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (featured !== undefined) where.featured = featured;
  if (lowStock) {
    where.currentStock = { not: undefined };
  }

  const sortMap: Record<string, any> = {
    newest: { createdAt: "desc" },
    oldest: { createdAt: "asc" },
    price_low: { retailPrice: "asc" },
    price_high: { retailPrice: "desc" },
    name: { name: "asc" },
    sales: { soldStock: "desc" },
  };

  const [total, products] = await Promise.all([
    db.storeProduct.count({ where }),
    db.storeProduct.findMany({
      where,
      orderBy: sortMap[sort] ?? { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        description: true,
        sku: true,
        images: true,
        retailPrice: true,
        costPrice: true,
        compareAtPrice: true,
        margin: true,
        currency: true,
        status: true,
        visibility: true,
        salesChannel: true,
        inventoryType: true,
        currentStock: true,
        reservedStock: true,
        incomingStock: true,
        damagedStock: true,
        lowStockThreshold: true,
        featured: true,
        sortOrder: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
        store: { select: { name: true } },
        _count: { select: { stockMovements: true, collections: true } },
      },
    }),
  ]);

  const enriched = products.map((p) => ({
    ...p,
    available: p.currentStock - p.reservedStock,
  }));

  if (lowStock) {
    const filtered = enriched.filter((p) => p.available <= p.lowStockThreshold);
    return okList(filtered, { page, limit, total: filtered.length });
  }

  return okList(enriched, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = StoreProductCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { costPrice, retailPrice, productType, productDetails, relatedProductIds, variants, variantOptions, ...rest } = parsed.data;
  // Type, details, versions (checked and normalized) and related products.
  const fields = await productFieldsData(store.id, { productType, productDetails, relatedProductIds, variants, variantOptions }, { inventoryType: rest.inventoryType });
  if (!fields.ok) return apiError("BAD_REQUEST", fields.error);

  const margin =
    costPrice != null && retailPrice > 0
      ? parseFloat((((retailPrice - costPrice) / retailPrice) * 100).toFixed(2))
      : null;

  const product = await db.storeProduct.create({
    data: {
      ...rest,
      ...(fields.data as Record<string, never>),
      storeId: store.id,
      userId: user.id,
      retailPrice,
      costPrice: costPrice ?? null,
      margin,
      status: rest.status ?? "draft",
      visibility: rest.visibility ?? "hidden",
    },
  });

  await markCatalogDirty(store.id);
  return ok(product, 201);
});
