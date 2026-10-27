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

export const dynamic = "force-dynamic";

// Quick edits from the supplier app's Products tab. PATCH { stockQuantity?, wholesalePrice?, suggestedRetailPrice?, publish?, preorder? }
//  - stock changes save straight away (they don't change what the listing says, so no new review);
//  - price changes on a live product send it back for review, like PATCH /api/supplier/products/[id];
//  - preorder { enabled, shipsAt (YYYY-MM-DD | null), limit, note } saves straight away (shared/preorder.ts rules);
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
      ...(input.wholesalePrice !== undefined ? { wholesalePrice: input.wholesalePrice } : {}),
      ...(input.suggestedRetailPrice !== undefined ? { suggestedRetailPrice: input.suggestedRetailPrice } : {}),
      ...(preorderParsed?.ok ? preorderSaveData(preorderParsed.value, { wasEnabled: product.preorderEnabled }) : {}),
      status,
    },
    select: {
      id: true, name: true, status: true, stockQuantity: true, wholesalePrice: true, suggestedRetailPrice: true,
      preorderEnabled: true, preorderShipsAt: true, preorderLimit: true, preorderTaken: true, preorderNote: true,
    },
  });
  invalidatePublicMarketplaceCache({ productSlug: product.slug, supplierSlug: supplier.slug, categorySlug: product.category.slug });
  return ok(updated);
});
