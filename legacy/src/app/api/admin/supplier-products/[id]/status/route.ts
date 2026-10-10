import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { ok, apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";

const ProductModerationSchema = z.object({
  action: z.enum(["approve", "reject", "unpublish", "mark_trending", "clear_trending"]),
  trendScore: z.number().min(0).max(1000).optional(),
});

export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ProductModerationSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { action, trendScore } = parsed.data;
  const data =
    action === "approve"
      ? { status: "published" as const }
      : action === "reject"
        ? { status: "rejected" as const }
        : action === "unpublish"
          ? { status: "unpublished" as const }
          : action === "mark_trending"
            ? { trendScore: trendScore ?? 100 }
            : { trendScore: 0 };

  const product = await db.supplierProduct.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      trendScore: true,
      updatedAt: true,
      supplier: { select: { id: true, displayName: true, slug: true, verificationStatus: true, status: true } },
      category: { select: { slug: true } },
    },
  }).catch(() => null);

  if (!product) return apiError("NOT_FOUND", "Supplier product not found", 404);

  invalidatePublicMarketplaceCache({
    productSlug: product.slug,
    supplierSlug: product.supplier.slug,
    categorySlug: product.category.slug,
  });
  return ok(product);
});
