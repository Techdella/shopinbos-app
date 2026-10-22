import "server-only";

import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { elevenLabsReady } from "@/lib/ai/elevenlabs.server";
import { liveCreditPrices } from "@/lib/ai/credits.server";
import { brandImageIdeas } from "@shared/brand-context";
import { reelBrand } from "@shared/video-style";
import type { RexMakerData } from "./types";

// What Rex's picture and reel makers need when they open in a pop-up on Social posts (the same as /studio/images
// and /home/video/studio load for themselves).

export async function rexMakerData(store: { id: string; name: string; slug: string; customDomain: string | null; logoUrl: string | null }): Promise<RexMakerData> {
  const [brand, { costs }, products] = await Promise.all([
    loadBrandContext(store.id).catch(() => null),
    liveCreditPrices(),
    db.storeProduct
      .findMany({
        where: { storeId: store.id, status: { not: "archived" }, NOT: { images: { isEmpty: true } } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 60,
        select: { id: true, name: true, retailPrice: true, images: true, description: true, videoUrl: true },
      })
      .catch(() => []),
  ]);
  return {
    storeName: store.name,
    image: {
      brand: brand
        ? {
            logoUrl: brand.logoUrl,
            colours: brand.colours ? [brand.colours.accent, brand.colours.button, brand.colours.ink, brand.colours.paper] : [],
            sells: brand.categories.slice(0, 4).map((category) => category.name),
            products: brand.products.slice(0, 8).map((product) => ({ name: product.name, photo: product.photo })),
          }
        : null,
      ideas: brandImageIdeas(brand),
    },
    reel: {
      storeHost: buildStorefrontUrl(store, "/").replace(/^https?:\/\//, "").replace(/\/$/, ""),
      brand: reelBrand(brand?.colours ?? null, store.logoUrl ?? brand?.logoUrl ?? null),
      elevenLabs: elevenLabsReady(),
      costs: { image: costs.photo ?? costs.image, video: costs.video },
      products: products.map((item) => ({ id: item.id, name: item.name, price: item.retailPrice, images: item.images.slice(0, 6), description: item.description ?? "", hasVideo: Boolean(item.videoUrl) })),
    },
  };
}
