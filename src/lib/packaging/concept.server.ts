import "server-only";

import { makeBrandImage } from "@/lib/ai/brand-image.server";
import { isOwnImageUrl } from "@/lib/ai/images";
import type { BrandContext } from "@shared/brand-context";
import { packConceptPrompt, packConceptShape, packVariants, type PackConceptInput } from "@shared/pack-concepts";

// Premium AI packaging renders (Packaging designer and Rex's make_packaging_mockup): the concept prompt from
// shared/pack-concepts.ts, the product photo and logo as references, drawn at high quality and stored in the
// seller's media library.

const SIZES = { portrait: "1024x1536", landscape: "1536x1024", square: "1024x1024" } as const;

export async function makePackConcept({
  brand,
  input,
  productPhotos,
  logo,
  userId,
}: {
  brand: BrandContext | null;
  input: Omit<PackConceptInput, "hasProductPhoto" | "hasLogo" | "brandName" | "accent">;
  /** The product's own photos (our storage only), so what's in the window is really theirs. */
  productPhotos: string[];
  /** Put the seller's logo on the packs. */
  logo: boolean;
  userId: string;
}) {
  const photos = productPhotos.filter(isOwnImageUrl).slice(0, 2);
  const useLogo = logo && Boolean(brand?.logoUrl);
  const prompt = packConceptPrompt({
    ...input,
    brandName: brand?.storeName ?? null,
    accent: brand?.colours?.accent ?? null,
    hasProductPhoto: photos.length > 0,
    hasLogo: useLogo,
  });
  const shape = packConceptShape(input.scene ?? "studio", packVariants(input.variants).length);
  const result = await makeBrandImage({ brand, prompt, size: SIZES[shape], logo: useLogo, colours: true, referenceUrls: photos, quality: "high", path: `generated/${userId}/pack-${Date.now()}` });
  return { ...result, shape };
}
