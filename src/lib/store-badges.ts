// The two badges on a seller's storefront:
//  - "Built with Shopinbos" in every store's footer, which paid sellers may turn off (showsShopinbosBadge);
//  - the payment logos the seller chose (shared/payment-badges.ts), checked here with zod before they are saved.
// Only zod and relative imports, so tests/store-badges.test.mjs loads it directly.

import { z } from "zod";
import { PAYMENT_BADGE_KEYS, cleanPaymentBadges } from "../../shared/payment-badges.ts";
import { TOP_SELLER_PLANS, type SellerPlanState } from "./seller-plan.ts";

/**
 * Whether the owner has paid time left on any plan (recorded by the Paystack webhook, src/lib/seller-plan.server.ts).
 * A seller who cancelled keeps what they paid for until it runs out.
 */
export function hasPaidPlanTime(user: Pick<SellerPlanState, "planStatus" | "planPaidUntil"> | null | undefined, now: Date): boolean {
  if (!user || (user.planStatus !== "active" && user.planStatus !== "non_renewing" && user.planStatus !== "cancelled") || !user.planPaidUntil) return false;
  const paidUntil = new Date(user.planPaidUntil).getTime();
  return Number.isFinite(paidUntil) && paidUntil > now.getTime();
}

/**
 * Only a seller on the highest plan (Seller Pro, monthly or annual) with paid time left may turn the "Built with
 * Shopinbos" badge off, on the storefront and the link in bio page; every other store always shows it.
 */
export function canHideShopinbosBadge(user: Pick<SellerPlanState, "planCode" | "planStatus" | "planPaidUntil"> | null | undefined, now: Date): boolean {
  return Boolean(user?.planCode && TOP_SELLER_PLANS.includes(user.planCode)) && hasPaidPlanTime(user, now);
}

/** The seller's choice, saved as brandSettings.hideShopinbosBadge (true = they turned it off). */
export function readHideShopinbosBadge(brandSettings: unknown): boolean {
  return Boolean(brandSettings && typeof brandSettings === "object" && (brandSettings as Record<string, unknown>).hideShopinbosBadge === true);
}

/**
 * Whether a store shows the "Built with Shopinbos" badge: on for every store by default. It goes away only when a
 * seller with paid time left turned it off; if their plan ends, it comes back.
 */
export function showsShopinbosBadge(
  user: Pick<SellerPlanState, "planCode" | "planStatus" | "planPaidUntil"> | null | undefined,
  now: Date,
  brandSettings?: unknown,
): boolean {
  return !(canHideShopinbosBadge(user, now) && readHideShopinbosBadge(brandSettings));
}

/** Where the badges a store can show link from: its footer (store_badge) or its link in bio page (bio_badge). */
export type ShopinbosBadgeRef = "store_badge" | "bio_badge";

/**
 * Where the badge links: sign-up on the app, tagged with the store it came from and where on it (a "start your own
 * store" call to action).
 */
export function shopinbosBadgeHref(slug: string, appUrl = "https://app.shopinbos.com", ref: ShopinbosBadgeRef = "store_badge") {
  return `${appUrl.replace(/\/$/, "")}/signup?ref=${ref}&s=${encodeURIComponent(slug)}`;
}

/** The logos a seller may save: known keys only, at most one of each. */
export const PaymentBadgesSchema = z
  .array(z.enum(PAYMENT_BADGE_KEYS, { message: "Choose from the listed payment logos." }), { message: "Choose from the listed payment logos." })
  .max(PAYMENT_BADGE_KEYS.length)
  .refine((keys) => new Set(keys).size === keys.length, "Each logo can only be chosen once.")
  .transform((keys) => cleanPaymentBadges(keys));

/** Checks a pick from the web or the phone app: the clean list, or the first problem in plain words. */
export function parsePaymentBadges(input: unknown): { ok: true; badges: (typeof PAYMENT_BADGE_KEYS)[number][] } | { ok: false; message: string } {
  const parsed = PaymentBadgesSchema.safeParse(input);
  return parsed.success ? { ok: true, badges: parsed.data } : { ok: false, message: parsed.error.issues[0]?.message ?? "Choose from the listed payment logos." };
}
