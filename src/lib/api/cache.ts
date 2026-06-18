import "server-only";

import { revalidatePath } from "next/cache";

const PUBLIC_MARKETPLACE_PATHS = [
  "/api/public/products",
  "/api/public/products/search",
  "/api/public/products/trending",
  "/api/public/suppliers",
  "/api/public/suppliers/search",
  "/api/public/logistics/partners",
  "/api/public/logistics/partners/search",
  "/api/public/categories",
];

interface PublicMarketplaceCacheTargets {
  productSlug?: string | null;
  supplierSlug?: string | null;
  logisticsSlug?: string | null;
  categorySlug?: string | null;
}

export function invalidatePublicMarketplaceCache(targets: PublicMarketplaceCacheTargets = {}) {
  for (const path of PUBLIC_MARKETPLACE_PATHS) {
    revalidatePath(path);
  }

  if (targets.productSlug) {
    revalidatePath(`/api/public/products/${targets.productSlug}`);
  }

  if (targets.supplierSlug) {
    revalidatePath(`/api/public/suppliers/${targets.supplierSlug}`);
  }

  if (targets.logisticsSlug) {
    revalidatePath(`/api/public/logistics/partners/${targets.logisticsSlug}`);
  }

  if (targets.categorySlug) {
    revalidatePath(`/api/public/categories/${targets.categorySlug}`);
    revalidatePath(`/api/public/products/category/${targets.categorySlug}`);
  }
}
