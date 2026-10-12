// Lines for the 404, error and "not open yet" pages. Pure (no imports) so it is unit-tested.
// App pages speak as Shopinbos (Rex builds stores, Peggy is the seller's assistant); storefront pages speak
// for the seller's shop, so they never mention Rex, Peggy or Shopinbos.

export const APP_NOT_FOUND_LINES = [
  "Omo, this page don japa.",
  "It's not you, it's Rex. He moved this page and forgot to tell anyone.",
  "Even Peggy searched everywhere. Nothing.",
  "We sent a dispatch rider. He's still circling the roundabout looking for this address.",
  "This page went to buy suya and never came back.",
] as const;

export const APP_ERROR_LINES = [
  "Something broke. Rex is already on it with a screwdriver.",
  "Our server took small break. E go soon wake.",
  "Small wahala. Nothing we can't fix.",
  "Rex tightened the wrong bolt. He is very sorry.",
  "Light blinked on our side. The generator is warming up.",
] as const;

export const STORE_NOT_FOUND_LINES = [
  "This one has left the shelf.",
  "Omo, this page don japa.",
  "We checked the back store too. Nothing here.",
  "The link took a wrong turn somewhere around the market.",
] as const;

export const STORE_ERROR_LINES = [
  "The shop counter jammed for a second.",
  "Small wahala on our side. Your bag is safe.",
  "Our till is being stubborn. One more try usually does it.",
] as const;

export const STORE_CLOSED_LINES = [
  "Shelves are being stocked. Good things take small time.",
  "The shutters are still down, but not for long.",
  "Unpacking boxes, polishing the counter. Almost there.",
] as const;

/** A different line from the one showing (wraps; a one-line pool keeps its line). */
export function nextLineIndex(current: number, count: number) {
  if (count <= 1) return 0;
  return (current + 1) % count;
}

/** A random line index other than `avoid`, from a 0..1 roll (Math.random in the browser, fixed in tests). */
export function randomLineIndex(count: number, roll: number, avoid = -1) {
  if (count <= 1) return 0;
  const safeRoll = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999) : 0;
  const pick = Math.floor(safeRoll * (avoid >= 0 && avoid < count ? count - 1 : count));
  return avoid >= 0 && avoid < count && pick >= avoid ? pick + 1 : pick;
}

/** Short, support-friendly form of an error digest ("Ref 2A9F…" stays readable on a phone). */
export function formatDigest(digest: string | undefined | null) {
  const clean = (digest ?? "").trim();
  if (!clean) return null;
  return clean.length > 24 ? `${clean.slice(0, 24)}…` : clean;
}
