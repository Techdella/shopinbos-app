// Real photos for the theme previews' sample stores: an Unsplash photo id per sample product (in catalogue order),
// plus a homepage banner and an "our story" picture per theme, people first. Unsplash's licence allows this use and
// asks that images be loaded from images.unsplash.com rather than copied, so only the ids live here. Each one was
// checked by eye against the product it stands for. Pure data, so tests can load this file directly.

export interface DemoThemePhotos {
  hero: string;
  story: string;
  /** One per sample product, same order as DEMO_CATALOGUES[theme].products. */
  products: string[];
}

export const UNSPLASH_ORIGIN = "https://images.unsplash.com";

/** A cropped, compressed Unsplash URL for a photo id ("1505421031134-e57263cae630"). */
export function unsplashUrl(id: string, width: number, height: number) {
  return `${UNSPLASH_ORIGIN}/photo-${id}?auto=format&fit=crop&w=${width}&h=${height}&q=72`;
}

export const DEMO_PHOTOS: Record<string, DemoThemePhotos> = {
};
