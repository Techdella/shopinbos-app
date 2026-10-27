import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { SupplierProductCreateSchema } from "@/lib/schemas";
import { isOnboardingComplete } from "@/lib/role-queries";
import { supplierPlanLimits, supplierProductLimitMessage } from "@/lib/plan-limits";
import { atLimit } from "@shared/plans";
import { slugify } from "@/lib/workspace";
import type { AuthUser } from "@/lib/auth/types";
import { notifyProductForReview } from "@/lib/notifications/events.server";
import { parsePreorderInput, preorderSaveData } from "@shared/preorder";

export const GET = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get("status");

  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);

  const where = {
    supplierId: supplier.id,
    ...(status ? { status: status as any } : {}),
  };

  const [total, products] = await Promise.all([
    db.supplierProduct.count({ where }),
    db.supplierProduct.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, name: true, slug: true, images: true,
        wholesalePrice: true, suggestedRetailPrice: true,
        currency: true, moq: true, stockQuantity: true,
        dropshipAvailable: true, status: true, trendScore: true, pricingTiers: true,
        // Preorders (the supplier's own listing, so the count taken is theirs to see).
        preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true,
        createdAt: true, updatedAt: true,
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { storeProducts: true, quoteRequests: true } },
      },
    }),
  ]);

  return okList(products, { page, limit, total });
});

export const POST = withSupplier(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = SupplierProductCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // Preorders (shared/preorder.ts): a real ship date (not past) and cap; saved as their own columns.
  const { preorder, ...fields } = parsed.data;
  const preorderParsed = preorder ? parsePreorderInput(preorder) : null;
  if (preorderParsed && !preorderParsed.ok) return apiError("BAD_REQUEST", preorderParsed.message);

  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  if (!isOnboardingComplete(supplier)) {
    return apiError("ONBOARDING_REQUIRED", "Complete supplier onboarding before adding products.", 403);
  }
  // Unverified suppliers build their catalogue as drafts: a "send for review" save is kept as a draft (the answer's
  // status says so), and only showing it to shops (sending it for review) waits for verification.
  const unverified = supplier.verificationStatus !== "verified";

  const [dbUser, productCount] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
  ]);
  const listings = supplierPlanLimits(dbUser ?? {}).listings;
  if (atLimit(productCount, listings)) {
    return apiError("PLAN_LIMIT", supplierProductLimitMessage(listings), 402);
  }

  const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) return apiError("NOT_FOUND", "Category not found", 404);

  if (parsed.data.status && !["draft", "pending_review"].includes(parsed.data.status)) {
    return apiError("FORBIDDEN", "Products must stay in draft or pending review until admin approval.", 403);
  }

  const baseSlug = slugify(parsed.data.name);
  const slug = `${baseSlug}-${supplier.id.slice(0, 6)}`;

  const product = await db.supplierProduct.create({
    data: {
      ...fields,
      ...(preorderParsed?.ok ? preorderSaveData(preorderParsed.value) : {}),
      ...(preorder?.depositPct !== undefined ? { preorderDepositPct: preorder.depositPct } : {}),
      supplierId: supplier.id,
      slug,
      status: parsed.data.status === "pending_review" && !unverified ? "pending_review" : "draft",
    },
  });
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: user.id, kind: "product_added", ref: product.id })).catch(() => undefined);

  invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: supplier.slug, categorySlug: category.slug });
  if (product.status === "pending_review") await notifyProductForReview(product.id, product.name, supplier.displayName);

  return ok(product, 201);
});
