// The payment logos a store shows shoppers (storefront footer, "We accept" on checkout), chosen by the seller on the
// web Payments page and the phone app's Payments screen. Saved as Store.brandSettings.paymentBadges (a list of the
// keys below). Pure and zod-free so the web, the phone app and the tests share it; the zod check that guards saves
// is in src/lib/store-badges.ts.

import { readShopPaymentMethods } from "./seller-payments.ts";

/** Every logo a seller can show, in the order they appear on the store. */
export const PAYMENT_BADGE_KEYS = [
  "visa",
  "mastercard",
  "verve",
  "amex",
  "paypal",
  "applepay",
  "googlepay",
  "paystack",
  "flutterwave",
  "opay",
  "transfer",
  "cod",
] as const;

export type PaymentBadgeKey = (typeof PAYMENT_BADGE_KEYS)[number];

/** Names as shoppers know them (brand names stay in English; the last two are translated where sellers see them). */
export const PAYMENT_BADGE_LABELS: Readonly<Record<PaymentBadgeKey, string>> = {
  visa: "Visa",
  mastercard: "Mastercard",
  verve: "Verve",
  amex: "American Express",
  paypal: "PayPal",
  applepay: "Apple Pay",
  googlepay: "Google Pay",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
  opay: "OPay",
  transfer: "Bank transfer",
  cod: "Pay on delivery",
};

/** The two badges drawn as an icon and words rather than a brand mark. */
export const TEXT_PAYMENT_BADGES: readonly PaymentBadgeKey[] = ["transfer", "cod"];

export function isPaymentBadgeKey(value: unknown): value is PaymentBadgeKey {
  return typeof value === "string" && (PAYMENT_BADGE_KEYS as readonly string[]).includes(value);
}

/** Known keys only, each once, in store order. */
export function cleanPaymentBadges(input: unknown): PaymentBadgeKey[] {
  if (!Array.isArray(input)) return [];
  const chosen = new Set(input.filter(isPaymentBadgeKey));
  return PAYMENT_BADGE_KEYS.filter((key) => chosen.has(key));
}

/** What a store shows before the seller picks: the ways customers can actually pay. Card gives Visa, Mastercard, Verve. */
export function defaultPaymentBadges(methods: { card?: boolean; korapay?: boolean; transfer?: boolean; cod?: boolean }): PaymentBadgeKey[] {
  return [
    // Korapay takes the same cards (it has no logo of its own here).
    ...(methods.card || methods.korapay ? (["visa", "mastercard", "verve"] as const) : []),
    ...(methods.transfer ? (["transfer"] as const) : []),
    ...(methods.cod ? (["cod"] as const) : []),
  ];
}

/** Why a logo can't be shown yet; the seller sees it under the logo, which they can't tap. */
export type BadgeBlock = "not_supported" | "turn_on_card" | "wallet" | "turn_on_transfer" | "transfer_bank" | "turn_on_cod";

/** Logos for ways Shopinbos checkout can't take payment (yet): never shown, so shoppers aren't promised them. */
export const UNSUPPORTED_PAYMENT_BADGES: readonly PaymentBadgeKey[] = ["amex", "paypal", "applepay", "googlepay", "flutterwave", "opay"];

/**
 * The logos a store can honestly show: only ways its checkout really takes payment. Card brands need card payments
 * (Paystack or Korapay) on and the seller's wallet able to take them; the Paystack logo, Paystack itself; bank
 * transfer, the method on and an account to pay into; pay on delivery, the method on. `blocked` says why each other
 * logo isn't available, for the seller.
 */
export function paymentBadgeAvailability(
  methods: { card?: boolean; korapay?: boolean; transfer?: boolean; cod?: boolean },
  ready: { cards: boolean; korapay: boolean; transfer: boolean },
): { available: PaymentBadgeKey[]; blocked: Partial<Record<PaymentBadgeKey, BadgeBlock>> } {
  const blocked: Partial<Record<PaymentBadgeKey, BadgeBlock>> = {};
  const cardOn = Boolean(methods.card || methods.korapay);
  const cardsWork = Boolean((methods.card && ready.cards) || (methods.korapay && ready.korapay));
  for (const key of ["visa", "mastercard", "verve"] as const) if (!cardsWork) blocked[key] = cardOn ? "wallet" : "turn_on_card";
  if (!(methods.card && ready.cards)) blocked.paystack = methods.card ? "wallet" : "turn_on_card";
  if (!methods.transfer) blocked.transfer = "turn_on_transfer";
  else if (!ready.transfer) blocked.transfer = "transfer_bank";
  if (!methods.cod) blocked.cod = "turn_on_cod";
  for (const key of UNSUPPORTED_PAYMENT_BADGES) blocked[key] = "not_supported";
  return { available: PAYMENT_BADGE_KEYS.filter((key) => !blocked[key]), blocked };
}

/** Whether the seller has picked their logos (an empty pick means "show none"). */
export function hasChosenPaymentBadges(brandSettings: unknown): boolean {
  const settings = brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {};
  return Array.isArray(settings.paymentBadges);
}

/**
 * The logos a store shows: the seller's pick, else the defaults from the payment methods they turned on. With
 * `available`, only those (a logo picked earlier for a way the store can't take payment is never shown).
 */
export function readPaymentBadges(brandSettings: unknown, available?: readonly PaymentBadgeKey[]): PaymentBadgeKey[] {
  const badges = hasChosenPaymentBadges(brandSettings)
    ? cleanPaymentBadges((brandSettings as Record<string, unknown>).paymentBadges)
    : defaultPaymentBadges(readShopPaymentMethods(brandSettings));
  return available ? badges.filter((badge) => available.includes(badge)) : badges;
}
