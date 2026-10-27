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
  return ok(product);
});

export const PATCH = withSupplier(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const product = await getOwnedProduct(params.id, user.id);
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = SupplierProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

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

  // Only changes to what shops see (words, photos, category, prices) send a live product back for review.
  const hasPublicFieldChanges = editNeedsReview(product, parsed.data);

  const updated = await db.supplierProduct.update({
    where: { id: params.id },
    data: {
      ...fields,
      ...(preorderParsed?.ok ? preorderSaveData(preorderParsed.value, { wasEnabled: product.preorderEnabled }) : {}),
      ...(product.status === "published" && hasPublicFieldChanges ? { status: "pending_review" } : {}),
    },
    include: {
      supplier: { select: { slug: true, displayName: true } },
      category: { select: { slug: true } },
    },
  });
  if (updated.status === "pending_review" && product.status !== "pending_review") await notifyProductForReview(updated.id, updated.name, updated.supplier.displayName);

  invalidatePublicMarketplaceCache({
    productSlug: updated.slug,
    supplierSlug: updated.supplier.slug,
    categorySlug: updated.category.slug,
  });

  return ok(updated);
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
