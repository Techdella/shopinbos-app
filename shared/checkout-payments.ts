// Turns the payment methods a seller saved (Store.brandSettings.paymentConfig.methods, written by onboarding
// and the Money page) into the options a buyer sees at checkout. Pure, so the checkout page, the checkout
// API and the tests all agree on what is on offer.

import { DEFAULT_PAYMENT_METHODS, type PaymentMethodKey } from "./onboarding.ts";

export type CheckoutPaymentMethod = "paystack" | "korapay" | "transfer" | "pay_on_delivery";

export const CHECKOUT_PAYMENT_METHODS = ["paystack", "korapay", "transfer", "pay_on_delivery"] as const satisfies readonly CheckoutPaymentMethod[];

/** Pay on delivery is capped by default, matching the "Up to ₦50,000" promise sellers see when they turn it on. */
export const DEFAULT_COD_LIMIT = 50_000;

export interface CheckoutZone {
  name: string;
  regions: string[];
  /** Customers in this zone collect their order, so there is no rider to pay. */
  pickupOnly: boolean;
}

export interface CheckoutPaymentSettings {
  /** The seller's saved choices, or null when they never chose. */
  methods: Partial<Record<PaymentMethodKey, boolean>> | null;
  /** Paystack keys are set on the server (and the seller's wallet can take card payments). */
  paystackReady: boolean;
  /** Korapay checkout with Split Payments is on and the seller's wallet has a Korapay split account. */
  korapayReady?: boolean;
  /** The seller's payout account can be shown to buyers (full number known). */
  transferReady: boolean;
  /** Highest order total for pay on delivery; null means no cap. */
  codLimit: number | null;
  /** Active delivery zones in checkout order. */
  zones: CheckoutZone[];
}

export interface CheckoutPaymentContext {
  city?: string;
  state?: string;
  /** Order total the buyer will pay. */
  total?: number;
}

export interface CheckoutPaymentOption {
  key: CheckoutPaymentMethod;
  label: string;
  hint: string;
}

export interface TransferAccount {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Paystack is usable only with a real secret key, not the placeholder from .env.local.example. */
export function paystackSecretReady(secret: string | undefined | null) {
  return Boolean(secret) && !secret!.includes("your_") && !secret!.includes("your-");
}

/** Saved payment choices from Store.brandSettings, or null when the seller never saved any. */
export function readSavedPaymentMethods(brandSettings: unknown): Partial<Record<PaymentMethodKey, boolean>> | null {
  const saved = record(record(record(brandSettings).paymentConfig).methods);
  const keys = Object.keys(DEFAULT_PAYMENT_METHODS) as PaymentMethodKey[];
  const chosen = keys.filter((key) => typeof saved[key] === "boolean");
  if (chosen.length === 0) return null;
  return Object.fromEntries(chosen.map((key) => [key, saved[key] as boolean]));
}

/** paymentConfig.codLimit when the seller set one (0 or a negative number turns the cap off); otherwise the default cap. */
export function readCodLimit(brandSettings: unknown): number | null {
  const limit = record(record(brandSettings).paymentConfig).codLimit;
  if (limit === null) return null;
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_COD_LIMIT;
  return limit > 0 ? limit : null;
}

/** How long a seller can give buyers to send a bank transfer before the order lets its items go (hours). */
export const TRANSFER_WINDOW_CHOICES = [2, 6, 12, 24, 48, 72] as const;

/**
 * paymentConfig.transferWindowHours: the seller's own window for unpaid bank-transfer orders, or null to use the
 * platform default (env UNPAID_TRANSFER_TTL_HOURS, 24 hours). Whole hours from 1 to 168.
 */
export function readTransferWindowHours(brandSettings: unknown): number | null {
  const hours = record(record(brandSettings).paymentConfig).transferWindowHours;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) return null;
  return Math.max(1, Math.min(Math.round(hours), 168));
}

/**
 * The account buyers pay into for bank transfer. The Money page stores only a masked number, so the full one
 * comes from the verified Paystack recipient (its details carry the account number) and must match the mask.
 * Returns null when the full number is not known; transfer is then not offered.
 */
export function readTransferAccount(brandSettings: unknown): TransferAccount | null {
  const bank = record(record(brandSettings).payoutBank);
  const bankName = typeof bank.bankName === "string" ? bank.bankName.trim() : "";
  const accountName = typeof bank.accountName === "string" ? bank.accountName.trim() : "";
  if (!bankName || !accountName) return null;
  const maskDigits = String(bank.accountNumberMask ?? "").replace(/\D/g, "");
  const candidates = [bank.accountNumber, record(record(record(bank.providerResponse).data).details).account_number];
  for (const candidate of candidates) {
    const digits = typeof candidate === "string" || typeof candidate === "number" ? String(candidate).replace(/\D/g, "") : "";
    if (digits.length !== 10) continue;
    if (maskDigits && !digits.endsWith(maskDigits.slice(-4))) continue;
    return { bankName, accountName, accountNumber: digits };
  }
  return null;
}

/** A zone with "pickup" or "collect" in its name or rate names means buyers collect there. */
export function isPickupOnlyZone(zone: { name: string; rates?: unknown }) {
  const names = [zone.name, ...(Array.isArray(zone.rates) ? zone.rates.map((rate) => record(rate).name) : [])];
  const words = names.filter((name): name is string => typeof name === "string");
  return words.length > 0 && words.every((name) => /pick\s*-?\s*up|collect/i.test(name));
}

/** First zone (in checkout order) covering the address: same rule the checkout uses for delivery fees. */
export function matchZone<Z extends { regions: string[] }>(zones: Z[], city = "", state = ""): Z | null {
  const c = city.toLowerCase();
  const s = state.toLowerCase();
  return (
    zones.find(
      (zone) => zone.regions.length === 0 || zone.regions.some((region) => {
        const r = region.toLowerCase();
        return c.includes(r) || (s !== "" && s.includes(r));
      }),
    ) ?? null
  );
}

/** Whether pay on delivery covers this address and total, with the reason when it does not. */
export function payOnDeliveryBlock(settings: CheckoutPaymentSettings, context: CheckoutPaymentContext = {}): string | null {
  if (settings.zones.length > 0 && (context.city || context.state)) {
    const zone = matchZone(settings.zones, context.city, context.state);
    if (!zone) return "Pay on delivery isn't available for this address.";
    if (zone.pickupOnly) return "Orders to this area are collected, so pay on delivery isn't available.";
  }
  if (settings.codLimit != null && context.total != null && context.total > settings.codLimit) {
    return `Pay on delivery is for orders up to ₦${Math.round(settings.codLimit).toLocaleString("en-NG")}.`;
  }
  return null;
}

const OPTION_COPY: Record<CheckoutPaymentMethod, Omit<CheckoutPaymentOption, "key">> = {
  paystack: { label: "Card, bank or USSD", hint: "Pay securely with Paystack" },
  korapay: { label: "Card or bank", hint: "Card, transfer or your bank app" },
  transfer: { label: "Bank transfer", hint: "We show you the account after you place the order" },
  pay_on_delivery: { label: "Pay on delivery", hint: "Pay the rider in cash or by transfer" },
};

/**
 * Buyer-facing payment options, always in the order Paystack, Korapay, bank transfer, pay on delivery.
 * When the seller chose nothing, or nothing they chose can be offered, falls back to the first way to pay that
 * works (card, then the second card checkout, then bank transfer), and to Paystack only when none does.
 */
export function checkoutPaymentOptions(settings: CheckoutPaymentSettings, context: CheckoutPaymentContext = {}): CheckoutPaymentOption[] {
  const methods = settings.methods;
  const keys: CheckoutPaymentMethod[] = [];
  if (methods) {
    if (methods.card && settings.paystackReady) keys.push("paystack");
    if (methods.korapay && settings.korapayReady) keys.push("korapay");
    if (methods.transfer && settings.transferReady) keys.push("transfer");
    if (methods.cod && !payOnDeliveryBlock(settings, context)) keys.push("pay_on_delivery");
  }
  if (keys.length === 0) keys.push(settings.paystackReady ? "paystack" : settings.korapayReady ? "korapay" : settings.transferReady ? "transfer" : "paystack");
  return keys.map((key) => ({ key, ...OPTION_COPY[key] }));
}

/** Maps the checkout body's paymentMethod (older clients send "redirect" or "inline", both Paystack). */
export function normalizeCheckoutMethod(value: string | undefined | null): CheckoutPaymentMethod {
  if (value === "korapay" || value === "transfer" || value === "pay_on_delivery") return value;
  return "paystack";
}

/** How the buyer chose to pay, for seller notifications. */
export function paymentChoiceText(method: CheckoutPaymentMethod) {
  if (method === "transfer") return "They'll pay by bank transfer; check your account, then mark the order as paid.";
  if (method === "pay_on_delivery") return "They'll pay on delivery, in cash or by transfer to the rider.";
  if (method === "korapay") return "They're paying online by card or bank.";
  return "They're paying by card, bank or USSD through Paystack.";
}

export interface FeeZone {
  regions: string[];
  rates: unknown;
}

/**
 * Delivery fee for an address: the first matching active zone's rate tier for this subtotal, or the store's
 * flat rate when it has no zones. Shared by the checkout API and the checkout page so the totals agree.
 */
export function deliveryFeeFor(zones: FeeZone[], flatRate: number, address: { city?: string; state?: string }, subtotal: number) {
  if (zones.length === 0) return flatRate;
  const zone = matchZone(zones, address.city, address.state);
  if (!zone) return 0;
  // Rates are stored as minValue/maxValue (ShippingRateSchema); min/max kept for older rows.
  const rates = (Array.isArray(zone.rates) ? zone.rates : []) as Array<{ minValue?: number; maxValue?: number; min?: number; max?: number; price?: number }>;
  const rate = rates.find((r) => {
    const min = r.minValue ?? r.min;
    const max = r.maxValue ?? r.max;
    return (!min || subtotal >= min) && (!max || subtotal <= max);
  });
  return rate?.price ?? 0;
}

/** Builds the checkout payment settings from a store's brandSettings and active shipping zones. */
export function checkoutPaymentSettings(brandSettings: unknown, zones: Array<{ name: string; regions: string[]; rates?: unknown }>, paystackReady: boolean, korapayReady = false): CheckoutPaymentSettings {
  return {
    methods: readSavedPaymentMethods(brandSettings),
    paystackReady,
    korapayReady,
    transferReady: readTransferAccount(brandSettings) !== null,
    codLimit: readCodLimit(brandSettings),
    zones: zones.map((zone) => ({ name: zone.name, regions: zone.regions, pickupOnly: isPickupOnlyZone(zone) })),
  };
}
