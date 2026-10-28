import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError, noContent } from "@/lib/api/response";
import { SupplierProductUpdateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { notifyProductForReview } from "@/lib/notifications/events.server";
import { editNeedsReview } from "@shared/supplier-product-review";
import { parsePreorderInput, preorderSaveData } from "@shared/preorder";
import { channelPriceProblem, cleanDropshipMinQty, cleanHandlingDays } from "@shared/dropship-rules";
import { preorderLevelProblem } from "@/lib/supplier-levels.server";
import { notifyPriceNotice, pendingPriceView, supplierPriceEdit } from "@/lib/marketplace/price-notice.server";

async function getOwnedProduct(productId: string, userId: string) {
  const supplier = await db.supplier.findUnique({ where: { userId } });
  if (!supplier) return null;
  return db.supplierProduct.findUnique({ where: { id: productId, supplierId: supplier.id } });
}

export const GET = withSupplier(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);
  // `pendingPrice`: a price rise waiting out its 7 days' notice ({ wholesalePrice, dropshipPrice, at }), or null.
  return ok({ ...product, pendingPrice: pendingPriceView(product) });
});

export const PATCH = withSupplier(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  const body = await req.json().catch(() => null);
  const result = SupplierProductUpdateSchema.safeParse(body);
  if (!result.success) {
    return apiError("BAD_REQUEST", result.error.issues[0]?.message ?? "Invalid input");
  }
  // A PATCH changes only the fields it sends: the schema's defaults (status, prices tiers, MOQ…) don't fill the rest.
  const sent = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const parsed = { data: Object.fromEntries(Object.entries(result.data).filter(([key]) => key in sent)) as typeof result.data };

  if (parsed.data.status && !["draft", "pending_review"].includes(parsed.data.status)) {
    return apiError("FORBIDDEN", "Products must stay in draft or pending review until admin approval.", 403);
  }
  if (parsed.data.status === "pending_review") {
    const owner = await db.supplier.findUnique({ where: { userId: user.id }, select: { verificationStatus: true } });
    if (owner?.verificationStatus !== "verified") {
      return apiError("VERIFICATION_REQUIRED", "You can send products for review once your business is verified. Keep it as a draft for now.", 403);
    }
  }

  // Preorders (shared/preorder.ts): checked here and saved as their own columns. A ship date already saved may have
  // passed; switching preorders back on starts a fresh count. They change straight away (no new review).
  const { preorder, ...fields } = parsed.data;
  const preorderParsed = preorder ? parsePreorderInput(preorder, new Date(), product.preorderShipsAt) : null;
  if (preorderParsed && !preorderParsed.ok) return apiError("BAD_REQUEST", preorderParsed.message);
  // Pre-orders open at Established (shared/dropship-rules.ts). A listing that already takes them stays editable,
  // and can always be switched off.
  if (preorderParsed?.ok && preorderParsed.value.preorderEnabled && !product.preorderEnabled) {
    const locked = await preorderLevelProblem(product.supplierId);
    if (locked) return apiError("preorder_locked", locked, 403);
  }

  // Prices per channel, checked on the product as it will be after this change.
  const priceProblem = channelPriceProblem({ ...product, ...fields, wholesalePrice: fields.wholesalePrice ?? product.wholesalePrice });
  if (priceProblem) return apiError("invalid_prices", priceProblem, 400);
  if (fields.dropshipMinQty !== undefined) fields.dropshipMinQty = cleanDropshipMinQty(fields.dropshipMinQty);
  if (fields.handlingDays !== undefined) fields.handlingDays = cleanHandlingDays(fields.handlingDays);

  // Only changes to what shops see (words, photos, category, prices) send a live product back for review.
  const hasPublicFieldChanges = editNeedsReview(product, parsed.data);
  // A price rise on a product shops already list waits 7 days (shared/price-notice.ts); cuts go live now. The
  // response's `pendingPrice` ({ wholesalePrice, dropshipPrice, at }) says when a waiting rise takes effect.
  const priceEdit = await supplierPriceEdit(product, {
    ...(fields.priceMode !== undefined ? { priceMode: fields.priceMode } : {}),
    ...(fields.wholesalePrice !== undefined ? { wholesalePrice: fields.wholesalePrice } : {}),
    ...(fields.dropshipPrice !== undefined ? { dropshipPrice: fields.dropshipPrice } : {}),
    ...(fields.pricingTiers !== undefined ? { pricingTiers: fields.pricingTiers } : {}),
  });

  const updated = await db.supplierProduct.update({
    where: { id: params.id },
    data: {
      ...fields,
      ...priceEdit.data,
      ...(preorderParsed?.ok ? preorderSaveData(preorderParsed.value, { wasEnabled: product.preorderEnabled }) : {}),
      ...(preorder?.depositPct !== undefined ? { preorderDepositPct: preorder.depositPct } : {}),
      ...(product.status === "published" && hasPublicFieldChanges ? { status: "pending_review" } : {}),
    },
    include: {
      supplier: { select: { slug: true, displayName: true } },
      category: { select: { slug: true } },
    },
  });
  if (updated.status === "pending_review" && product.status !== "pending_review") await notifyProductForReview(updated.id, updated.name, updated.supplier.displayName);
  if (priceEdit.plan.kind === "notice") await notifyPriceNotice(updated.id);

  invalidatePublicMarketplaceCache({
    productSlug: updated.slug,
    supplierSlug: updated.supplier.slug,
    categorySlug: updated.category.slug,
  });

  return ok({ ...updated, pendingPrice: pendingPriceView(updated) });
});

export const DELETE = withSupplier(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  await db.supplierProduct.update({
    where: { id: params.id },
    data: { status: "unpublished" },
  });

  const supplier = await db.supplier.findUnique({
    where: { userId: user.id },
    select: { slug: true },
  });
  const category = await db.category.findUnique({
    where: { id: product.categoryId },
    select: { slug: true },
  });
  invalidatePublicMarketplaceCache({
    productSlug: product.slug,
    supplierSlug: supplier?.slug,
    categorySlug: category?.slug,
  });

  return noContent();
});
