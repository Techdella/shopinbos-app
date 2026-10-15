// The shopper's bag, wishlist and checkout rules, shared by the cart page, the cart drawer, the checkout page,
// the checkout API and the behaviour tests. Pure (no imports beyond other shared helpers), so the total a
// shopper sees is the total the API charges.

import { matchZone } from "./checkout-payments.ts";

// ─── Bag lines ────────────────────────────────────────────────────────────────

export interface CartLine {
  productId: string;
  name: string;
  /** Unit price the shopper saw when adding (the API re-prices from the product). */
  price: number;
  quantity: number;
  image?: string;
  /** Variant label, e.g. "Black / M". Same product with another variant is another line. */
  variant?: string;
  /** The version's id in the product's variants (shared/product-variants.ts); the label above is shown. */
  variantId?: string;
  /** Units in stock for this line when the seller tracks it. */
  maxQuantity?: number;
}

/** Highest quantity of one line in a bag, whatever the stock. */
export const MAX_LINE_QUANTITY = 99;

export function lineKey(line: Pick<CartLine, "productId" | "variant">) {
  return `${line.productId}::${line.variant ?? ""}`;
}

export function clampQuantity(quantity: number, maxQuantity?: number) {
  const cap = typeof maxQuantity === "number" && maxQuantity > 0 ? Math.min(maxQuantity, MAX_LINE_QUANTITY) : MAX_LINE_QUANTITY;
  const whole = Number.isFinite(quantity) ? Math.floor(quantity) : 1;
  return Math.max(1, Math.min(cap, whole));
}

export function cartCount(lines: Array<Pick<CartLine, "quantity">>) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function cartSubtotal(lines: Array<Pick<CartLine, "price" | "quantity">>) {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

/** Adds lines into a bag, summing quantities of the same product + variant and keeping the stock cap. */
export function mergeLines(existing: CartLine[], incoming: CartLine[]): CartLine[] {
  const out = existing.map((line) => ({ ...line }));
  for (const line of incoming) {
    const match = out.find((entry) => lineKey(entry) === lineKey(line));
    if (match) {
      match.quantity = clampQuantity(match.quantity + line.quantity, line.maxQuantity ?? match.maxQuantity);
      if (typeof line.maxQuantity === "number") match.maxQuantity = line.maxQuantity;
    } else {
      out.push({ ...line, quantity: clampQuantity(line.quantity, line.maxQuantity) });
    }
  }
  return out;
}

/** Bag lines read from storage or a request: anything malformed is dropped. */
export function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const lines: CartLine[] = [];
  for (const raw of value.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.productId !== "string" || !entry.productId) continue;
    const price = Number(entry.price);
    const quantity = Number(entry.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) continue;
    const maxQuantity = typeof entry.maxQuantity === "number" && entry.maxQuantity > 0 ? entry.maxQuantity : undefined;
    lines.push({
      productId: entry.productId.slice(0, 64),
      name: typeof entry.name === "string" ? entry.name.slice(0, 200) : "Item",
      price,
      quantity: clampQuantity(quantity, maxQuantity),
      ...(typeof entry.image === "string" && entry.image ? { image: entry.image.slice(0, 1000) } : {}),
      ...(typeof entry.variant === "string" && entry.variant ? { variant: entry.variant.slice(0, 120) } : {}),
      ...(typeof entry.variantId === "string" && entry.variantId ? { variantId: entry.variantId.slice(0, 80) } : {}),
      ...(maxQuantity ? { maxQuantity } : {}),
    });
  }
  return mergeLines([], lines);
}

// ─── Variant pricing (server) ─────────────────────────────────────────────────

interface VariantLike {
  name?: unknown;
  sku?: unknown;
  color?: unknown;
  size?: unknown;
  price?: unknown;
  stock?: unknown;
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Every label a storefront may have used for this variant (the product pages name variants two ways). */
export function variantLabels(variant: VariantLike) {
  const name = str(variant.name);
  const sku = str(variant.sku);
  const colourSize = [str(variant.color), str(variant.size)].filter(Boolean).join(" / ");
  const full = [name, str(variant.color), str(variant.size)].filter(Boolean).join(" / ");
  return [...new Set([colourSize || name || sku, full || sku, name, sku].filter(Boolean))];
}

/** The variant a bag line names, from the product's stored variants; null when it is not one of them. */
export function findVariant(variants: unknown, label: string | undefined | null): VariantLike | null {
  if (!label || !Array.isArray(variants)) return null;
  const wanted = label.trim().toLowerCase();
  for (const raw of variants) {
    if (!raw || typeof raw !== "object") continue;
    const variant = raw as VariantLike;
    if (variantLabels(variant).some((entry) => entry.toLowerCase() === wanted)) return variant;
  }
  return null;
}

/** Unit price for a line: the variant's own price when it has one, else the product price. */
export function linePrice(basePrice: number, variants: unknown, label: string | undefined | null) {
  const variant = findVariant(variants, label);
  const price = variant && typeof variant.price === "number" && Number.isFinite(variant.price) && variant.price > 0 ? variant.price : null;
  return price ?? basePrice;
}

// ─── Totals ───────────────────────────────────────────────────────────────────

export interface OrderTotals {
  subtotal: number;
  /** Money off the products. */
  productDiscount: number;
  /** Money off delivery (free-delivery discounts). */
  deliveryDiscount: number;
  /** productDiscount + deliveryDiscount, as stored on the order. */
  discountAmount: number;
  shippingFee: number;
  total: number;
}

/**
 * Order totals with one discount applied. The amount comes from discountAmount() in src/lib/discounts.ts
 * (percentage, fixed, buy X get Y, product scope); a free-delivery discount comes off the delivery fee, any
 * other off the products, and neither can take its part below zero.
 */
export function orderTotals(input: { subtotal: number; shippingFee: number; discount?: { type: string; amount: number } | null }): OrderTotals {
  const subtotal = Math.max(0, input.subtotal);
  const shippingFee = Math.max(0, input.shippingFee);
  const amount = Math.max(0, input.discount?.amount ?? 0);
  const freeDelivery = input.discount?.type === "free_shipping";
  const productDiscount = freeDelivery ? 0 : Math.round(Math.min(amount, subtotal) * 100) / 100;
  const deliveryDiscount = freeDelivery ? Math.min(amount, shippingFee) : 0;
  return {
    subtotal,
    productDiscount,
    deliveryDiscount,
    discountAmount: productDiscount + deliveryDiscount,
    shippingFee,
    total: subtotal - productDiscount + (shippingFee - deliveryDiscount),
  };
}

// ─── Delivery options ─────────────────────────────────────────────────────────

export interface DeliveryZoneInput {
  name?: string;
  regions: string[];
  rates: unknown;
}

export interface DeliveryOption {
  id: string;
  name: string;
  price: number;
  estimatedDays: string | null;
  /** The shopper collects the order. */
  pickup: boolean;
}

export interface DeliveryChoice {
  /** False when the store has zones but none covers this address. */
  covered: boolean;
  options: DeliveryOption[];
}

const PICKUP_WORDS = /pick\s*-?\s*up|collect/i;

/**
 * The delivery options a shopper can pick for an address and bag value: every rate of the first matching
 * zone whose order-value band fits (same matching as deliveryFeeFor), or the flat rate when there are no zones.
 * The first option is what deliveryFeeFor charges, so leaving the choice alone keeps the old totals.
 */
export function deliveryOptionsFor(zones: DeliveryZoneInput[], flatRate: number, address: { city?: string; state?: string }, subtotal: number): DeliveryChoice {
  if (zones.length === 0) {
    return { covered: true, options: [{ id: "flat", name: "Delivery", price: Math.max(0, flatRate || 0), estimatedDays: null, pickup: false }] };
  }
  const zone = matchZone(zones, address.city, address.state);
  if (!zone) return { covered: false, options: [] };
  const rates = (Array.isArray(zone.rates) ? zone.rates : []) as Array<Record<string, unknown>>;
  const options: DeliveryOption[] = [];
  rates.forEach((rate, index) => {
    const min = (typeof rate.minValue === "number" ? rate.minValue : undefined) ?? (typeof rate.min === "number" ? rate.min : undefined);
    const max = (typeof rate.maxValue === "number" ? rate.maxValue : undefined) ?? (typeof rate.max === "number" ? rate.max : undefined);
    if (!((!min || subtotal >= min) && (!max || subtotal <= max))) return;
    const name = str(rate.name) || str(zone.name) || "Delivery";
    options.push({
      id: str(rate.id) || `r${index}`,
      name,
      price: typeof rate.price === "number" && rate.price > 0 ? rate.price : 0,
      estimatedDays: str(rate.estimatedDays) || null,
      pickup: PICKUP_WORDS.test(name),
    });
  });
  return { covered: true, options };
}

/** The option the shopper chose (or the first one) and its fee. No option means no fee, as before. */
export function chooseDelivery(choice: DeliveryChoice, optionId?: string | null) {
  const option = choice.options.find((entry) => entry.id === optionId) ?? choice.options[0] ?? null;
  return { option, fee: option?.price ?? 0 };
}

// ─── Free delivery progress ───────────────────────────────────────────────────

export function freeDeliveryProgress(subtotal: number, threshold: number | null | undefined) {
  if (!threshold || threshold <= 0) return null;
  const remaining = Math.max(0, threshold - subtotal);
  return { threshold, remaining, reached: remaining === 0, percent: Math.min(100, Math.round((subtotal / threshold) * 100)) };
}

// ─── Checkout steps ───────────────────────────────────────────────────────────

export const CHECKOUT_STEPS = ["contact", "delivery", "payment", "review"] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

export const CHECKOUT_STEP_LABELS: Record<CheckoutStep, string> = {
  contact: "Contact",
  delivery: "Delivery",
  payment: "Payment",
  review: "Review",
};

export interface CheckoutDetails {
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  country: string;
  landmark: string;
}

export interface CheckoutRules {
  requirePhone: boolean;
  /** The country has a state list, so a state must be picked (zones match on it). */
  requireState: boolean;
  /** Delivery options on offer for the address; an empty list is allowed (fee confirmed by the store). */
  deliveryOptionIds: string[];
  /** Payment methods on offer for this address and total. */
  paymentMethods: string[];
}

export type FieldErrors = Partial<Record<keyof CheckoutDetails | "deliveryOption" | "paymentMethod", string>>;

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** 7 to 15 digits, with an optional leading +. */
export function isPhone(value: string) {
  const trimmed = value.trim();
  if (!/^\+?[\d\s()-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** What is wrong with one step, field by field, in words a shopper understands. Empty when the step is done. */
export function stepErrors(
  step: CheckoutStep,
  details: CheckoutDetails,
  rules: CheckoutRules,
  choice: { deliveryOptionId?: string | null; paymentMethod?: string | null } = {},
): FieldErrors {
  const errors: FieldErrors = {};
  if (step === "contact") {
    if (details.name.trim().length < 2) errors.name = "Enter your full name.";
    if (!details.email.trim()) errors.email = "Enter your email so we can send your receipt.";
    else if (!isEmail(details.email)) errors.email = "That email doesn't look right. Check it and try again.";
    if (details.phone.trim()) {
      if (!isPhone(details.phone)) errors.phone = "Enter a phone number with 7 to 15 digits.";
    } else if (rules.requirePhone) {
      errors.phone = "Enter a phone number so the store can reach you about delivery.";
    }
  }
  if (step === "delivery") {
    if (details.street.trim().length < 3) errors.street = "Enter your street address.";
    if (!details.city.trim()) errors.city = "Enter your area or city.";
    if (rules.requireState && !details.state.trim()) errors.state = "Choose your state.";
    if (rules.deliveryOptionIds.length > 0 && !rules.deliveryOptionIds.includes(choice.deliveryOptionId ?? rules.deliveryOptionIds[0]!)) {
      errors.deliveryOption = "Choose a delivery option.";
    }
  }
  if (step === "payment") {
    const method = choice.paymentMethod ?? rules.paymentMethods[0];
    if (!method || !rules.paymentMethods.includes(method)) errors.paymentMethod = "Choose how you'd like to pay.";
    else if (method === "pay_on_delivery" && !isPhone(details.phone)) errors.phone = "Add a phone number so the rider can reach you for pay on delivery.";
  }
  return errors;
}

/** The first step with something missing (review when every step is done). */
export function firstIncompleteStep(details: CheckoutDetails, rules: CheckoutRules, choice: { deliveryOptionId?: string | null; paymentMethod?: string | null } = {}): CheckoutStep {
  for (const step of CHECKOUT_STEPS) {
    if (Object.keys(stepErrors(step, details, rules, choice)).length > 0) return step;
  }
  return "review";
}

/** Contact and address saved on this device, read back defensively (it is whatever is in localStorage). */
export function sanitizeSavedDetails(value: unknown): Partial<CheckoutDetails> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: Partial<CheckoutDetails> = {};
  for (const key of ["name", "email", "phone", "street", "city", "state", "country", "landmark"] as const) {
    if (typeof raw[key] === "string") out[key] = (raw[key] as string).slice(0, 200);
  }
  return out;
}

// ─── Abandoned-cart recovery tokens ───────────────────────────────────────────

/** 24 random bytes as base64url: 32 characters, unguessable. */
export function newRecoveryToken() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isRecoveryToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
}

/** The furthest of two checkout steps, so a capture never moves a cart backwards. */
export function furthestStep(a: string | null | undefined, b: string | null | undefined): CheckoutStep | null {
  const ia = CHECKOUT_STEPS.indexOf(a as CheckoutStep);
  const ib = CHECKOUT_STEPS.indexOf(b as CheckoutStep);
  const best = Math.max(ia, ib);
  return best >= 0 ? CHECKOUT_STEPS[best]! : null;
}

// ─── Wishlist sharing ─────────────────────────────────────────────────────────

export const MAX_SHARED_WISHLIST = 50;

/** Product ids from a shared wishlist link (?items=a,b,c): only id-shaped values, no duplicates. */
export function parseSharedWishlist(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids = value.split(",").map((id) => id.trim()).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));
  return [...new Set(ids)].slice(0, MAX_SHARED_WISHLIST);
}

export function sharedWishlistQuery(ids: string[]) {
  return `items=${ids.slice(0, MAX_SHARED_WISHLIST).map(encodeURIComponent).join(",")}`;
}

// ─── "You may also like" ──────────────────────────────────────────────────────

interface UpsellProduct {
  id: string;
  category?: { slug?: string | null } | null;
  reviewCount?: number | null;
  avgRating?: number | null;
}

/**
 * Suggestions for the bag: the seller's chosen upsell products first, then products from the same
 * categories as the bag, then the best reviewed. Never something already in the bag.
 */
export function suggestProducts<P extends UpsellProduct>(products: P[], bagProductIds: string[], pinned: string[] = [], limit = 4): P[] {
  const inBag = new Set(bagProductIds);
  const available = products.filter((product) => !inBag.has(product.id));
  const byId = new Map(available.map((product) => [product.id, product]));
  const picked: P[] = [];
  const add = (product: P | undefined) => {
    if (product && !picked.includes(product) && picked.length < limit) picked.push(product);
  };
  for (const id of pinned) add(byId.get(id));
  const bagCategories = new Set(products.filter((product) => inBag.has(product.id)).map((product) => product.category?.slug).filter(Boolean));
  for (const product of available) if (product.category?.slug && bagCategories.has(product.category.slug)) add(product);
  const ranked = available
    .map((product, index) => ({ product, index }))
    .sort((a, b) => (b.product.reviewCount ?? 0) - (a.product.reviewCount ?? 0) || (b.product.avgRating ?? 0) - (a.product.avgRating ?? 0) || a.index - b.index);
  for (const entry of ranked) add(entry.product);
  return picked;
}

// ─── Seller settings the storefront honours ───────────────────────────────────

export type AfterAddBehaviour = "drawer" | "cart_page" | "checkout";

export interface CartSettings {
  /** What happens after a shopper adds to the bag. */
  afterAdd: AfterAddBehaviour;
  /** Hearts, the wishlist page and "save for later". */
  wishlist: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Store.brandSettings.cartConfig, including values older settings screens saved. */
export function readCartSettings(brandSettings: unknown): CartSettings {
  const config = record(record(brandSettings).cartConfig);
  const behaviour = String(config.addToCartBehavior ?? "drawer");
  const afterAdd: AfterAddBehaviour =
    behaviour === "cart_page" || behaviour === "redirect_cart" ? "cart_page" : behaviour === "checkout" || behaviour === "redirect_checkout" ? "checkout" : "drawer";
  return { afterAdd, wishlist: config.enableWishlist !== false };
}

export interface CheckoutSettings {
  requirePhone: boolean;
  enableNotes: boolean;
  enableGiftNote: boolean;
  enableCoupon: boolean;
  enableUpsells: boolean;
  enableTrustBadges: boolean;
  upsellProducts: string[];
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  requirePhone: false,
  enableNotes: true,
  enableGiftNote: false,
  enableCoupon: true,
  enableUpsells: false,
  enableTrustBadges: true,
  upsellProducts: [],
};

/** The CheckoutConfig row (or nothing) as the settings checkout honours. */
export function readCheckoutSettings(row: Partial<CheckoutSettings> | null | undefined): CheckoutSettings {
  const out = { ...DEFAULT_CHECKOUT_SETTINGS };
  if (!row) return out;
  for (const key of ["requirePhone", "enableNotes", "enableGiftNote", "enableCoupon", "enableUpsells", "enableTrustBadges"] as const) {
    if (typeof row[key] === "boolean") out[key] = row[key] as boolean;
  }
  if (Array.isArray(row.upsellProducts)) out.upsellProducts = row.upsellProducts.filter((id): id is string => typeof id === "string").slice(0, 12);
  return out;
}

/** Order note sent to the seller: the shopper's note plus the gift message, each only when that option is on. */
export function orderNotes(settings: Pick<CheckoutSettings, "enableNotes" | "enableGiftNote">, notes?: string | null, giftMessage?: string | null) {
  const parts = [
    settings.enableNotes && notes?.trim() ? notes.trim().slice(0, 1000) : null,
    settings.enableGiftNote && giftMessage?.trim() ? `Gift message: ${giftMessage.trim().slice(0, 500)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}
