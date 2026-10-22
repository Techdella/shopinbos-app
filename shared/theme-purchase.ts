// Buying a single storefront theme instead of upgrading the plan (src/lib/themes/purchase.server.ts). Every seller
// can preview every theme; a premium or platinum theme their plan doesn't include can be bought once for the price
// in Admin › Pricing and is theirs to use from then on, on any plan. Pure, so the gallery, the server and tests share it.

import type { PriceBook } from "./platform-pricing.ts";

/** Paystack references for theme purchases start with this (the webhook routes on it). */
export const THEME_REFERENCE_PREFIX = "theme-";

export type BuyableTier = "premium" | "platinum";

export function isBuyableTier(tier: unknown): tier is BuyableTier {
  return tier === "premium" || tier === "platinum";
}

/** What one theme of this tier costs, in naira (basic themes are free, so null). */
export function themePriceNaira(tier: string, book: Pick<PriceBook, "themes.premium" | "themes.platinum">): number | null {
  if (tier === "premium") return book["themes.premium"];
  if (tier === "platinum") return book["themes.platinum"];
  return null;
}

/** "₦2,000" */
export function formatThemePrice(naira: number) {
  return `₦${Math.round(naira).toLocaleString("en-NG")}`;
}
