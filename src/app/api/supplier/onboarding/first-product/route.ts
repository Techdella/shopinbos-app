import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import { readPhotoDataUri } from "@/lib/kyc/identity";
import { supplierPlanLimits, supplierProductLimitMessage } from "@/lib/plan-limits";
import { UploadRejectedError, uploadFileServer } from "@/lib/supabase/storage.server";
import { slugify } from "@/lib/workspace";
import { atLimit } from "@shared/plans";

export const runtime = "nodejs";

// "Add your first product" (supplier onboarding): a photo, a name and a price, saved as a draft with the supplier's
// own defaults (how shops can buy, minimum order, first category). It stays a draft until the supplier is verified
// and sends it for review, like any product; the full product form can fill in the rest later.
export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = String(body?.name ?? "").replace(/\s+/g, " ").trim();
  const price = Math.round(Number(body?.price));
  if (name.length < 2 || name.length > 200) return apiError("BAD_REQUEST", "Type what the product is called.");
  if (!Number.isFinite(price) || price < 1 || price > 1_000_000_000) return apiError("BAD_REQUEST", "Type the price in naira.");
  const photo = readPhotoDataUri(body?.photo, "product photo");
  if (!photo.ok) return apiError("BAD_REQUEST", photo.error);

  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, slug: true, categories: true, buyModes: true, minimumOrder: true, user: { select: { aiCredits: true } } } });
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const listings = supplierPlanLimits(supplier.user ?? {}).listings;
  if (atLimit(await db.supplierProduct.count({ where: { supplierId: supplier.id } }), listings)) return apiError("PLAN_LIMIT", supplierProductLimitMessage(listings), 402);

  const wanted = supplier.categories[0];
  const category =
    (wanted ? await db.category.findFirst({ where: { OR: [{ name: { equals: wanted, mode: "insensitive" } }, { slug: slugify(wanted) }] } }) : null) ??
    (await db.category.findFirst({ where: { parentId: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }));
  if (!category) return apiError("UNAVAILABLE", "We couldn't save products just now. Try again later.", 503);

  let image: string;
  try {
    const file = new File([new Uint8Array(photo.bytes)], `product.${photo.ext}`, { type: photo.mimeType });
    image = (await uploadFileServer("products", file)).publicUrl;
  } catch (error) {
    if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", "That photo isn't a picture we can read. Take it again.");
    console.error("[supplier onboarding] product photo upload failed", error);
    return apiError("INTERNAL_ERROR", "We couldn't save the photo. Please try again.", 500);
  }

  const wholesale = supplier.buyModes.includes("wholesale");
  const product = await db.supplierProduct.create({
    data: {
      supplierId: supplier.id,
      name,
      slug: `${slugify(name)}-${supplier.id.slice(0, 6)}-${Date.now().toString(36).slice(-4)}`,
      description: name,
      categoryId: category.id,
      images: [image],
      wholesalePrice: price,
      suggestedRetailPrice: price,
      currency: "NGN",
      moq: wholesale ? supplier.minimumOrder ?? 1 : 1,
      dropshipAvailable: supplier.buyModes.includes("dropship"),
      bulkOrderAvailable: wholesale || !supplier.buyModes.length,
      deliveryRegions: [],
      status: "draft",
    },
    select: { id: true, slug: true, name: true },
  });
  invalidatePublicMarketplaceCache({ supplierSlug: supplier.slug });
  return ok(product, 201);
});
