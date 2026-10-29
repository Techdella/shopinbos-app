import { NextRequest } from "next/server";
import { productLimitProblem } from "@/lib/plans/gates.server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { StoreProductCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { productFieldsData } from "@/lib/products/save-fields.server";
import { stockTrackingFor } from "@shared/product-stock";
import { isShortCodeClash } from "@shared/product-codes";
import { withShortCode } from "@/lib/products/short-code.server";
import { announceStorePaths } from "@/lib/seo/search-ping.server";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const sp = req.nextUrl.searchParams;
  const { page, limit, skip } = parsePagination(sp);

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found. Complete onboarding first.", 404);
  const planLimit = await productLimitProblem(user.id, store.id);
  if (planLimit) return apiError("PLAN_LIMIT", planLimit, 402);

  const [total, products] = await Promise.all([
    db.storeProduct.count({ where: { storeId: store.id } }),
    db.storeProduct.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, name: true, description: true, images: true,
        retailPrice: true, costPrice: true, currency: true,
        margin: true, fulfillmentType: true, status: true,
        createdAt: true, updatedAt: true,
        supplierProduct: {
          select: { id: true, name: true, slug: true, supplier: { select: { id: true, displayName: true } } },
        },
      },
    }),
  ]);

  return okList(products, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = StoreProductCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found. Complete onboarding first.", 404);

  const { retailPrice, costPrice, variants, productType, productDetails, relatedProductIds, variantOptions, ...rest } = parsed.data;
  const fields = await productFieldsData(store.id, { productType, productDetails, relatedProductIds, variants: variants.length ? variants : undefined, variantOptions }, { inventoryType: rest.inventoryType });
  if (!fields.ok) return apiError("BAD_REQUEST", fields.error);
  const margin = costPrice && retailPrice > costPrice
    ? Math.round(((retailPrice - costPrice) / retailPrice) * 100)
    : null;

  // "Track stock": the seller's choice, else on when they gave a count (or versions with their own counts).
  const versionTotal = typeof fields.data.currentStock === "number" ? fields.data.currentStock : undefined;
  const trackStock = stockTrackingFor({ trackStock: rest.trackStock, currentStock: versionTotal ?? rest.currentStock, variantsCounted: versionTotal !== undefined });

  const { shortCode: typedCode, ...fieldsToSave } = rest;
  const create = (shortCode: string | null) =>
    db.storeProduct.create({
      data: {
        ...fieldsToSave,
        shortCode,
        trackStock,
        storeId: store.id,
        userId: user.id,
        retailPrice,
        costPrice,
        margin,
        ...(fields.data as Record<string, never>),
      },
    });
  // The seller's own code when they typed one, else the next one for this product (BAG1, BAG2…).
  let product;
  try {
    product = typedCode
      ? await create(typedCode)
      : await withShortCode(store.id, { name: rest.name, productType: productType ?? null, categoryId: rest.categoryId ?? null }, create);
  } catch (error) {
    if (typedCode && isShortCodeClash(error)) return apiError("CODE_TAKEN", `Another product already uses the code ${typedCode}. Pick a different one.`, 409);
    throw error;
  }
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "product_added", ref: product.id })).catch(() => undefined);

  await markCatalogDirty(store.id);
  announceStorePaths(store.slug, [`/product/${encodeURIComponent(product.id)}`]);
  return ok(product, 201);
});
