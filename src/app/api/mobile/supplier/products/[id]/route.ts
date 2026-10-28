import { NextRequest } from "next/server";
import { z } from "zod";
import { withSupplier } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { supplierForUser } from "../../_shared";
import { editNeedsReview } from "@shared/supplier-product-review";
import { parsePreorderInput, preorderSaveData } from "@shared/preorder";
import { PreorderInputSchema } from "@/lib/schemas";
import { channelPriceProblem } from "@shared/dropship-rules";
import { preorderLevelProblem } from "@/lib/supplier-levels.server";
import { notifyPriceNotice, pendingPriceView, supplierPriceEdit } from "@/lib/marketplace/price-notice.server";

export const dynamic = "force-dynamic";

// Quick edits from the supplier app's Products tab. PATCH { stockQuantity?, wholesalePrice?, suggestedRetailPrice?, publish?, preorder? }
//  - stock changes save straight away (they don't change what the listing says, so no new review);
//  - price changes on a live product send it back for review, like PATCH /api/supplier/products/[id]; a rise on a
//    product shops already list waits 7 days (shared/price-notice.ts): the response's `pendingPrice`
//    ({ wholesalePrice, dropshipPrice, at }) says when it takes effect, and the shops are told;
//  - preorder { enabled, shipsAt (YYYY-MM-DD | null), limit, note } saves straight away (shared/preorder.ts rules);
//  - the same rules as the portal's PATCH: prices per channel checked together (400 invalid_prices,
//    shared/dropship-rules.ts channelPriceProblem) and pre-orders switched on only at Established (403 preorder_locked);
//  - publish: true sends a draft or unpublished product for review (admins publish it), false takes it off the marketplace.
// Full edits (name, description, tiers, regions) use PATCH /api/supplier/products/[id].

const Body = z.object({
  stockQuantity: z.number().int().min(0).max(10_000_000).optional(),
  wholesalePrice: z.number().positive().optional(),
  suggestedRetailPrice: z.number().positive().optional(),
  publish: z.boolean().optional(),
  preorder: PreorderInputSchema.optional(),
});

export const PATCH = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const product = await db.supplierProduct.findFirst({ where: { id: String(params.id), supplierId: supplier.id }, include: { category: { select: { slug: true } } } });
  if (!product) return apiError("NOT_FOUND", "Product not found", 404);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the numbers and try again.");
  const input = parsed.data;
  const preorderParsed = input.preorder ? parsePreorderInput(input.preorder, new Date(), product.preorderShipsAt) : null;
  if (preorderParsed && !preorderParsed.ok) return apiError("BAD_REQUEST", preorderParsed.message);
  // Pre-orders open at Established. A listing that already takes them stays editable, and can always be switched off.
  if (preorderParsed?.ok && preorderParsed.value.preorderEnabled && !product.preorderEnabled) {
    const locked = await preorderLevelProblem(product.supplierId);
    if (locked) return apiError("preorder_locked", locked, 403);
  }
  // Prices per channel, checked on the product as it will be after this change.
  const priceProblem = channelPriceProblem({
    ...product,
    wholesalePrice: input.wholesalePrice ?? product.wholesalePrice,
    suggestedRetailPrice: input.suggestedRetailPrice ?? product.suggestedRetailPrice,
  });
  if (priceProblem) return apiError("invalid_prices", priceProblem, 400);

  // A rise on a product shops list waits 7 days (src/lib/marketplace/price-notice.server.ts); a cut goes live now.
  const priceEdit = await supplierPriceEdit(product, { wholesalePrice: input.wholesalePrice });
  const priceChanged = editNeedsReview(product, { wholesalePrice: input.wholesalePrice, suggestedRetailPrice: input.suggestedRetailPrice });
  let status = product.status;
  if (input.publish === true && ["draft", "unpublished", "rejected"].includes(product.status)) {
    if (supplier.verificationStatus !== "verified") return apiError("VERIFICATION_REQUIRED", "Products go live after your business is verified.", 403);
    status = "pending_review";
  }
  if (input.publish === false && product.status !== "unpublished") status = "unpublished";
  if (priceChanged && status === "published") status = "pending_review";

  const updated = await db.supplierProduct.update({
    where: { id: product.id },
    data: {
      ...(input.stockQuantity !== undefined ? { stockQuantity: input.stockQuantity } : {}),
      ...priceEdit.data,
      ...(input.suggestedRetailPrice !== undefined ? { suggestedRetailPrice: input.suggestedRetailPrice } : {}),
      ...(preorderParsed?.ok ? preorderSaveData(preorderParsed.value, { wasEnabled: product.preorderEnabled }) : {}),
      ...(input.preorder?.depositPct !== undefined ? { preorderDepositPct: input.preorder.depositPct } : {}),
      status,
    },
    select: {
      id: true, name: true, status: true, stockQuantity: true, wholesalePrice: true, suggestedRetailPrice: true,
      preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true, preorderDepositPct: true,
      pendingPrice: true, pendingPriceAt: true,
    },
  });
  if (priceEdit.plan.kind === "notice") await notifyPriceNotice(product.id);
  invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: supplier.slug, categorySlug: product.category.slug });
  const { pendingPrice: _pending, pendingPriceAt: _pendingAt, ...rest } = updated;
  void _pending;
  void _pendingAt;
  return ok({ ...rest, pendingPrice: pendingPriceView(updated) });
});
