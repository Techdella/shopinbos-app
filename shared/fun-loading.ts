// Friendly words while Rex or Peggy works (a logo, a video, a picture, a connection): one line at a time, changing
// every few seconds, under a working Rex. The web (src/components/app-ui/FunLoader.tsx) and the phone app
// (apps/mobile/src/components/FunLoader.tsx) show the same lines; the words are in the "common" catalog as
// "fun.<kind>.<n>", so other languages can say it their own way.

export const FUN_LOADING_KINDS = ["logo", "video", "image", "connect", "general"] as const;
export type FunLoadingKind = (typeof FUN_LOADING_KINDS)[number];

/** How many lines each kind has in the catalog ("fun.logo.1" … "fun.logo.5"). */
export const FUN_LOADING_COUNT: Record<FunLoadingKind, number> = { logo: 5, video: 5, image: 5, connect: 4, general: 4 };

/** Milliseconds each line stays up. */
export const FUN_LOADING_STEP_MS = 2800;

/** The catalog keys for a kind, in order. */
export function funLoadingKeys(kind: FunLoadingKind): string[] {
  return Array.from({ length: FUN_LOADING_COUNT[kind] }, (_, index) => `fun.${kind}.${index + 1}`);
}

/** The line to show after `ticks` steps: it goes through them once, then stays on the last ones (no restart). */
export function funLoadingIndex(kind: FunLoadingKind, ticks: number): number {
  const count = FUN_LOADING_COUNT[kind];
  if (ticks < count) return Math.max(0, ticks);
  // After the first pass, alternate between the last two lines so it still feels alive.
  return count - 2 + ((ticks - count) % 2);
}
