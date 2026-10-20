// How much of a store Rex builds for what the seller has: today's free allowance first, then bought AI credits.
// A full build is one store design, one pass that writes every page (and its search title), and a photo for the
// banner, each product and the story section, as many as the allowance and credits cover. A quick build is the
// design alone. Pure, unit-tested in tests/rex-full-build.test.mjs; the numbers come from src/lib/ai/usage.ts.

export type BuildMode = "full" | "quick";

export interface BuildBudget {
  /** What is left of today's free allowance, per kind. */
  left: { build: number; text: number; image: number };
  /** Bought AI credits. */
  balance: number;
  /** Credits per use once the allowance is spent. */
  costs: { build: number; text: number; image: number };
}

export interface BuildPlan {
  mode: BuildMode;
  /** False when even the store design can't be paid for. */
  canBuild: boolean;
  /** The pass that writes every page. */
  pages: boolean;
  /** Photos Rex will make, and how many of them come out of the free allowance. */
  photos: number;
  freePhotos: number;
  /** Photo spots Rex will leave as colour blocks (not enough allowance or credits). */
  photosShort: number;
  /** Bought credits the build will use. */
  credits: number;
}

/** Banner + story picture + up to six product photos. */
export const MAX_BUILD_PHOTOS = 8;

export function photoSlotsFor(productsWithoutPhotos: number) {
  return Math.min(MAX_BUILD_PHOTOS, 2 + Math.max(0, Math.min(6, productsWithoutPhotos)));
}

export function planBuild(budget: BuildBudget, mode: BuildMode, photoSlots: number): BuildPlan {
  let balance = Math.max(0, Math.floor(budget.balance));
  let credits = 0;
  /** Takes one use of `kind`: free while the allowance lasts, else credits. False when neither covers it. */
  const left = { ...budget.left };
  const take = (kind: "build" | "text") => {
    if (left[kind] > 0) {
      left[kind] -= 1;
      return true;
    }
    if (balance >= budget.costs[kind]) {
      balance -= budget.costs[kind];
      credits += budget.costs[kind];
      return true;
    }
    return false;
  };

  const none: BuildPlan = { mode, canBuild: false, pages: false, photos: 0, freePhotos: 0, photosShort: 0, credits: 0 };
  if (!take("build")) return none;
  if (mode === "quick") return { ...none, canBuild: true, credits };

  const pages = take("text");
  const slots = Math.max(0, Math.min(MAX_BUILD_PHOTOS, photoSlots));
  const freePhotos = Math.min(slots, Math.max(0, left.image));
  const paidPhotos = budget.costs.image > 0 ? Math.min(slots - freePhotos, Math.floor(balance / budget.costs.image)) : slots - freePhotos;
  credits += paidPhotos * budget.costs.image;
  const photos = freePhotos + paidPhotos;
  return { mode, canBuild: true, pages, photos, freePhotos, photosShort: slots - photos, credits };
}
