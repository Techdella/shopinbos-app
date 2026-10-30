import "server-only";

import { db } from "@/lib/db/client";
import { isOwnImageUrl } from "@/lib/ai/images";
import { accentFrom, colourSetsFor, dominantColours, type LabelledColourSet, type Rgb } from "@shared/colour-sets";
import { palettesFor, readRexBuild, styleDef, type StyleId } from "@shared/seller-onboarding";

// Colour sets from the seller's logo and product photos (onboarding D2b; rules in shared/colour-sets.ts). Each
// picture is shrunk to 48 px with sharp and its pixels clustered in plain TS; only pictures in our own storage are
// fetched (isOwnImageUrl), so a saved URL can't make the server call anywhere else.

const MAX_BYTES = 12 * 1024 * 1024;
const SIDE = 48;
const PHOTOS = 6;

type Sharp = (typeof import("sharp"))["default"];
async function loadSharp(): Promise<Sharp | null> {
  try {
    return (await import("sharp")).default;
  } catch {
    return null;
  }
}

/** The visible pixels of a picture (transparent ones left out), shrunk to at most 48 × 48. Empty when it can't load. */
export async function picturePixels(url: string): Promise<Rgb[]> {
  if (!isOwnImageUrl(url)) return [];
  const sharp = await loadSharp();
  if (!sharp) return [];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return [];
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return [];
    const { data, info } = await sharp(bytes, { failOn: "error" }).rotate().resize({ width: SIDE, height: SIDE, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels: Rgb[] = [];
    for (let i = 0; i + 3 < data.length; i += info.channels) {
      if (data[i + 3]! < 128) continue;
      pixels.push([data[i]!, data[i + 1]!, data[i + 2]!]);
    }
    return pixels;
  } catch {
    return [];
  }
}

/** The brand colour of a set of pictures (null: none, or nothing colourful in them). */
export async function accentOfPictures(urls: readonly string[]): Promise<string | null> {
  const all = await Promise.all(urls.map((url) => picturePixels(url)));
  const pixels = all.flat();
  return pixels.length ? accentFrom(dominantColours(pixels, 6)) : null;
}

/** The three colour sets for this seller's shop: from the logo, from the product photos, and Rex's pick. */
export async function colourSetsForSeller(userId: string, style?: StyleId | null): Promise<LabelledColourSet[]> {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, logoUrl: true, brandSettings: true } });
  const flowStyle = style ?? readRexBuild(store?.brandSettings).style ?? null;
  const presets = palettesFor(flowStyle);
  const dark = styleDef(flowStyle).id === "luxury";
  if (!store) return colourSetsFor({ presets, dark });
  const products = await db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, orderBy: { createdAt: "asc" }, take: 20, select: { images: true } });
  const photos = products.map((product) => product.images[0]).filter((url): url is string => Boolean(url) && isOwnImageUrl(url!)).slice(0, PHOTOS);
  const [logoAccent, photoAccent] = await Promise.all([store.logoUrl ? accentOfPictures([store.logoUrl]) : Promise.resolve(null), photos.length ? accentOfPictures(photos) : Promise.resolve(null)]);
  return colourSetsFor({ logoAccent, photoAccent, presets, dark });
}
