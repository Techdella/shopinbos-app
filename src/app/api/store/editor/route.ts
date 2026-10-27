import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { parseBody } from "@/lib/api/validate";
import { EditorUpdateSchema } from "@/lib/schemas";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { loadShopperInfo } from "@/lib/storefront/shopper-info.server";
import { forShoppers } from "@shared/product-stock";
import {
  buildEditorEnvelope,
  createSnapshotFromTemplate,
  createBlankEditorSnapshot,
  getCurrentTemplateMeta,
  getTemplateManifest,
  guessPageType,
  hydrateDraftFromStoreConfig,
  resolveDraftSnapshot,
  updateDraftFromOps,
  updateDraftFromSnapshot,
  type StoreBrandSettingsLike,
} from "@/lib/store-templates";
import { checkThemeSwitch } from "@/lib/theme-access";
import { loadSellerThemeAccess } from "@/lib/theme-access.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getStoreEditorData(userId: string) {
  const store = await db.store.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      city: true,
      country: true,
      currency: true,
      status: true,
      customDomain: true,
      brandSettings: true,
      storeProducts: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          images: true,
          retailPrice: true,
          currency: true,
          category: { select: { id: true, name: true, slug: true } },
          // The builder's product page preview shows the real product.
          compareAtPrice: true,
          variants: true,
          variantOptions: true,
          productType: true,
          productDetails: true,
          relatedProductIds: true,
          tags: true,
          sku: true,
          longDescription: true,
          specifications: true,
          faqs: true,
          careInstructions: true,
          shippingInfo: true,
          returnPolicy: true,
          warranty: true,
          supportInfo: true,
          videoUrl: true,
          // Stock as shoppers see it (forShoppers), and the product's own page layout / sections.
          fulfillmentType: true,
          supplierProduct: { select: { stockQuantity: true } },
          trackStock: true,
          continueSellingWhenOut: true,
          currentStock: true,
          reservedStock: true,
          lowStockThreshold: true,
          preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true,
          pageLayout: true,
        },
      },
    },
  });

  if (!store) return null;

  const productIds = store.storeProducts.map((product) => product.id);
  const reviewMap = new Map<string, { avgRating: number; count: number }>();
  if (productIds.length > 0) {
    const placeholders = productIds.map((_, index) => `$${index + 1}`).join(",");
    try {
      const reviewStats = await db.$queryRawUnsafe<Array<{ productId: string; avg: number; count: bigint }>>(
        `SELECT "productId", AVG(rating)::float AS avg, COUNT(*)::bigint AS count FROM "ProductReview" WHERE "productId" = ANY(ARRAY[${placeholders}]) AND status = 'approved' GROUP BY "productId"`,
        ...productIds,
      );
      for (const review of reviewStats) {
        reviewMap.set(review.productId, { avgRating: Math.round(review.avg * 10) / 10, count: Number(review.count) });
      }
    } catch {
      // Review aggregation is optional for older local setups.
    }
  }

  return {
    ...store,
    storeProducts: store.storeProducts.map((product) => {
      const review = reviewMap.get(product.id);
      return {
        ...forShoppers(product),
        avgRating: review?.avgRating ?? 0,
        reviewCount: review?.count ?? 0,
      };
    }),
  };
}

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await getStoreEditorData(user.id);
  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const brandSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const selectedTemplate = getCurrentTemplateMeta(brandSettings);
  // "blank" (Start blank) and retired templates have no manifest: then the saved draft is the only source.
  const selectedManifest = selectedTemplate ? getTemplateManifest(selectedTemplate.templateId) : null;
  const fallbackDraft = selectedManifest ? createSnapshotFromTemplate(selectedManifest) : null;
  const envelope = buildEditorEnvelope(brandSettings, fallbackDraft);
  // The builder previews the store as shoppers see it: delivery promises, WhatsApp, collections and real reviews.
  const shopper = await loadShopperInfo(store.id, store.brandSettings, store.storeProducts);

  return NextResponse.json({
    data: {
      store: { ...store, shopper, storefrontUrl: buildStorefrontUrl(store) },
      seller: {
        name: user.name || user.email?.split("@")[0]?.replace(/[._-]/g, " ") || "there",
        email: user.email,
      },
      ...envelope,
      canStartBlank: !envelope.draft,
    },
  });
});

export const PATCH = withSeller(async (req: NextRequest, { user }) => {
  const store = await getStoreEditorData(user.id);
  if (!store) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });
  }

  const parsed = await parseBody(EditorUpdateSchema, req);
  if ("error" in parsed) return parsed.error;

  const body = parsed.data;

  const brandSettings = ((store.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike;
  const selectedTemplate = getCurrentTemplateMeta(brandSettings);
  const selectedManifest = selectedTemplate ? getTemplateManifest(selectedTemplate.templateId) : null;
  const fallbackDraft = selectedManifest ? createSnapshotFromTemplate(selectedManifest) : createBlankEditorSnapshot(store.name);

  let nextSettings = brandSettings;
  let draft = resolveDraftSnapshot(brandSettings, fallbackDraft);

  if (body.snapshot && typeof body.snapshot === "object" && !Array.isArray(body.snapshot)) {
    // A saved snapshot can't move the store onto a theme its plan doesn't include (switching goes through
    // /api/store/templates/apply, which checks the same rule).
    const nextThemeId = (body.snapshot as { templateId?: unknown }).templateId;
    if (typeof nextThemeId === "string" && nextThemeId !== draft?.templateId) {
      const themeAccess = await loadSellerThemeAccess(user.id);
      const access = checkThemeSwitch(nextThemeId, themeAccess.tier, draft?.templateId, themeAccess.owned);
      if (!access.ok) return NextResponse.json({ error: { code: "UPGRADE_REQUIRED", message: access.message } }, { status: 403 });
    }
    nextSettings = updateDraftFromSnapshot(brandSettings, body.snapshot as never);
    draft = body.snapshot as never;
  } else if (Array.isArray(body.ops)) {
    const result = updateDraftFromOps(brandSettings, body.ops as never, fallbackDraft);
    nextSettings = result.brandSettings;
    draft = result.updated;
  } else if (body.hydrateFromStoreConfig && typeof body.hydrateFromStoreConfig === "object" && !Array.isArray(body.hydrateFromStoreConfig)) {
    const result = hydrateDraftFromStoreConfig(brandSettings, body.hydrateFromStoreConfig as never, fallbackDraft);
    nextSettings = result.brandSettings;
    draft = result.updated;
  } else {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Provide snapshot, ops, or hydrateFromStoreConfig." } }, { status: 400 });
  }

  const updated = await db.store.update({
    where: { id: store.id },
    data: {
      brandSettings: nextSettings as unknown as Prisma.InputJsonValue,
    },
    select: {
      brandSettings: true,
    },
  });

  return NextResponse.json({
    data: {
      draft,
      template: getCurrentTemplateMeta(((updated.brandSettings as Record<string, unknown>) ?? {}) as StoreBrandSettingsLike),
      pageType: guessPageType(draft?.pages[0]?.pageType ?? "home"),
    },
  });
});
