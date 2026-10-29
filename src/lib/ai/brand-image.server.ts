import "server-only";

import { generateImage, loadReferences, MAX_REFERENCES, type ImageQuality, type ImageSize } from "@/lib/ai/images";
import { brandImageBrief, type BrandContext } from "@shared/brand-context";

// A picture in the seller's brand: their logo (sent to the image model as the first reference, so it is
// copied rather than invented), their colours and feel, and any photos or video stills they gave Rex.
// Used by Rex's generate_product_image tool and the Rex Studio "Make image" page (/api/ai/generate-image).

export interface BrandImageResult {
  url: string;
  /** The logo really went in as a reference. */
  usedLogo: boolean;
  /** The seller's own photos that went in as references. */
  usedReferences: number;
  /** Why the logo couldn't be used, when it was asked for. */
  logoProblem: "no_logo" | "unreadable" | null;
}

export async function makeBrandImage({
  brand,
  prompt,
  size,
  logo,
  colours,
  referenceUrls = [],
  quality,
  path,
}: {
  brand: BrandContext | null;
  prompt: string;
  size: ImageSize;
  /** Put the seller's logo on it. */
  logo: boolean;
  /** Keep to the brand colours and feel. */
  colours: boolean;
  /** Photos (or video stills) from our own storage to work from. */
  referenceUrls?: string[];
  /** "high" for premium work (packaging mockups, ads). */
  quality?: ImageQuality;
  path: string;
}): Promise<BrandImageResult> {
  const logoUrl = logo ? brand?.logoUrl ?? null : null;
  const logoRef = logoUrl ? await loadReferences([logoUrl]) : [];
  const others = await loadReferences(referenceUrls.filter((url) => url !== logoUrl).slice(0, MAX_REFERENCES - logoRef.length));
  const brief = brandImageBrief(brand ? { ...brand, logoUrl: logoRef.length ? brand.logoUrl : null } : null, { logo, colours, otherReferences: others.length });
  const url = await generateImage({ prompt: `${prompt.trim()}\n\n${brief}`, size, references: [...logoRef, ...others], quality, path });
  return {
    url,
    usedLogo: logoRef.length > 0,
    usedReferences: others.length,
    logoProblem: !logo ? null : !logoUrl ? "no_logo" : logoRef.length ? null : "unreadable",
  };
}
