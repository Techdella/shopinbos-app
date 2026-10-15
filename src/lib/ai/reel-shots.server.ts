import "server-only";

import { editImage } from "@/lib/ai/images";
import { makeBrandImage } from "@/lib/ai/brand-image.server";
import type { BrandContext } from "@shared/brand-context";
import { reelShotPrompt, type ReelShotLook } from "@shared/video-style";

// One product photo made ready for a reel (video studio "Make shots with Rex", Rex's make_product_video): cut
// out on a see-through background, on a clean studio backdrop in the brand colour, or a branded ad shot with
// the logo. The caller meters it as an image first.
export async function makeReelShot(input: { userId: string; source: string; look: ReelShotLook; product: string | null; brand: BrandContext | null; n: number }) {
  const path = `enhanced/${input.userId}/reel-${input.look}-${Date.now()}-${input.n}`;
  const prompt = reelShotPrompt(input.look, { product: input.product, colours: input.brand?.colours ?? null });
  if (input.look === "brand") {
    return (await makeBrandImage({ brand: input.brand, prompt, size: "1024x1536", logo: true, colours: true, referenceUrls: [input.source], path })).url;
  }
  return editImage({ sourceUrl: input.source, prompt, transparent: input.look === "cutout", size: input.look === "cutout" ? "1024x1024" : "1024x1536", path });
}
