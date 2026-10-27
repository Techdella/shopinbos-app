import { NextRequest } from "next/server";
import { productLimitProblem } from "@/lib/plans/gates.server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { StoreProductCreateSchema, StoreProductQuerySchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { productFieldsData } from "@/lib/products/save-fields.server";
import { stockTrackingFor } from "@shared/product-stock";
import { parsePreorderInput, preorderSaveData } from "@shared/preorder";
import { isShortCodeClash, normalizeShortCode, storefrontProductUrl } from "@shared/product-codes";
import { withShortCode } from "@/lib/products/short-code.server";
import { storeUrl } from "@/lib/marketing/brand";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = StoreProductQuerySchema.safeParse(rawParams);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid query params");
  }

  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const { status, visibility, inventoryType, categoryId, collectionId, q, code, featured, lowStock, sort } = parsed.data;

  const where: any = { storeId: store.id };

  // One status, several ("active,published" for live), or all but one ("!archived", the web list's "All").
  if (status?.startsWith("!")) where.status = { not: status.slice(1) };
  else if (status?.includes(",")) where.status = { in: status.split(",").map((value) => value.trim()).filter(Boolean) };
  else if (status) where.status = status;
  if (visibility) where.visibility = visibility;
  if (inventoryType) where.inventoryType = inventoryType;
  if (categoryId) where.categoryId = categoryId;
  if (collectionId) where.collections = { some: { collectionId } };
  // A search finds names and short codes ("bag2" finds BAG2); `code` is one exact code (Find product by code).
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { shortCode: normalizeShortCode(q).replace(/\s+/g, "") }];
  if (code) where.shortCode = normalizeShortCode(code).replace(/\s+/g, "");
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
        shortCode: true,
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

  // `url`: the product's page on the storefront (Share to WhatsApp on the phone's product list).
  const enriched = products.map((p) => ({
    ...p,
    available: p.currentStock - p.reservedStock,
    url: storefrontProductUrl(storeUrl(store), p.id),
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

  const { costPrice, retailPrice, productType, productDetails, relatedProductIds, variants, variantOptions, preorder, ...rest } = parsed.data;
  // Preorders: a real ship date and cap; never on dropship products (they sell the supplier's stock).
  const preorderParsed = preorder ? parsePreorderInput(preorder) : null;
  if (preorderParsed && !preorderParsed.ok) return apiError("BAD_REQUEST", preorderParsed.message);
  const preorderData = {
    ...(preorderParsed?.ok ? preorderSaveData(preorderParsed.value, { dropship: rest.fulfillmentType === "dropship" || rest.inventoryType === "dropshipping" }) : {}),
    // The deposit shoppers pay at checkout (0 = all of it then; shared/preorder.ts storeOrderDeposit).
    ...(preorderParsed?.ok && typeof preorder?.depositPct === "number" ? { preorderDepositPct: preorder.depositPct } : {}),
  };
  const planLimit = await productLimitProblem(user.id, store.id);
  if (planLimit) return apiError("PLAN_LIMIT", planLimit, 402);
  // Type, details, versions (checked and normalized) and related products.
  const fields = await productFieldsData(store.id, { productType, productDetails, relatedProductIds, variants, variantOptions }, { inventoryType: rest.inventoryType });
  if (!fields.ok) return apiError("BAD_REQUEST", fields.error);

  const margin =
    costPrice != null && retailPrice > 0
      ? parseFloat((((retailPrice - costPrice) / retailPrice) * 100).toFixed(2))
      : null;

  // "Track stock": the seller's choice, else on when they gave a count (or versions with their own counts).
  const versionTotal = typeof fields.data.currentStock === "number" ? fields.data.currentStock : undefined;
  const trackStock = stockTrackingFor({ trackStock: rest.trackStock, currentStock: versionTotal ?? rest.currentStock, variantsCounted: versionTotal !== undefined });

  const { shortCode: typedCode, ...fieldsToSave } = rest;
  const create = (shortCode: string | null) =>
    db.storeProduct.create({
      data: {
        ...fieldsToSave,
        ...(fields.data as Record<string, never>),
        shortCode,
        trackStock,
        ...preorderData,
        storeId: store.id,
        userId: user.id,
        retailPrice,
        costPrice: costPrice ?? null,
        margin,
        status: rest.status ?? "draft",
        visibility: rest.visibility ?? "hidden",
      },
    });
  // The seller's own code when they typed one (a clash is theirs to fix), else the next one for this product.
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
  return ok(product, 201);
});
