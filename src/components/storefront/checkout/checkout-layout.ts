// Checkout page settings and pure helpers. The settings live on the checkout page's "checkout-form" section in the
// store's editor snapshot (settings + copy block), so the builder edits the draft and the live checkout route reads
// the published snapshot. 2026 themes start from their own defaults (CHECKOUT_THEME_DEFAULTS); classic templates
// start from the section's saved classic layout (single-page, multi-step, minimal). The seller's choice wins.
// Pure (only relative imports of other pure modules), so the behaviour tests load it directly.

import { formatStoreMoney, freeDeliveryEverywhereOver, freeDeliveryPromise, whatsappLink, type StorefrontShopperInfo } from "../../../lib/storefront/shopper-info.ts";
import { stepErrors, type CartLine, type CheckoutDetails, type CheckoutRules, type CheckoutStep, type FieldErrors } from "../../../../shared/cart-checkout.ts";

export type CheckoutLayout = "two-column" | "stacked" | "steps" | "minimal";
export type CheckoutSummaryBlock = "items" | "discount" | "delivery" | "trust" | "secure" | "returns" | "whatsapp";
export type CheckoutSummaryPosition = "right" | "left";
export type CheckoutHeader = "nav" | "logo";

export const CHECKOUT_LAYOUT_OPTIONS: Array<{ value: CheckoutLayout; label: string; hint: string }> = [
  { value: "two-column", label: "Two columns", hint: "Form on one side, order summary that stays in view on the other." },
  { value: "stacked", label: "One page", hint: "Everything on one page, the order summary folds open at the top." },
  { value: "steps", label: "Steps", hint: "Contact, delivery, then payment, one step at a time with progress." },
  { value: "minimal", label: "Minimal", hint: "A narrow centred column, your logo only, nothing to distract." },
];

export const CHECKOUT_SUMMARY_BLOCKS: Array<{ value: CheckoutSummaryBlock; label: string }> = [
  { value: "items", label: "Items in the bag" },
  { value: "discount", label: "Discount code" },
  { value: "delivery", label: "Delivery estimate" },
  { value: "trust", label: "Trust badges" },
  { value: "secure", label: "Secure checkout line" },
  { value: "returns", label: "Returns policy link" },
  { value: "whatsapp", label: "WhatsApp help link" },
];

export const DEFAULT_SUMMARY_BLOCKS: CheckoutSummaryBlock[] = ["items", "discount", "delivery", "trust", "secure", "returns", "whatsapp"];

export interface CheckoutPageSettings {
  layout: CheckoutLayout;
  /** Order summary parts that show, in order. The totals always follow the items and discount code. */
  summaryBlocks: CheckoutSummaryBlock[];
  /** Two columns and Steps on wide screens. */
  summaryPosition: CheckoutSummaryPosition;
  /** The store's page links in the header, or the logo only (Minimal is always logo only). */
  header: CheckoutHeader;
  /** Small photos beside the items in the summary. */
  thumbnails: boolean;
  /** The order note box (when notes are on in Checkout settings). */
  orderNote: boolean;
  /** A short message above the form. */
  message: string;
  labels: {
    /** Empty: "Place order", or "Pay ₦…" for card payments. */
    placeOrder: string;
    /** Empty: "Continue to delivery" and so on. */
    continue: string;
    summary: string;
  };
}

interface ThemeDefault {
  layout: CheckoutLayout;
  summaryPosition: CheckoutSummaryPosition;
  header: CheckoutHeader;
}

/** Each 2026 theme's own checkout: what suits its shoppers and look. */
export const CHECKOUT_THEME_DEFAULTS: Record<string, ThemeDefault> = {
  breeze: { layout: "two-column", summaryPosition: "right", header: "logo" },
  noir: { layout: "minimal", summaryPosition: "right", header: "logo" },
  plain: { layout: "two-column", summaryPosition: "right", header: "logo" },
  adire: { layout: "two-column", summaryPosition: "left", header: "nav" },
  pantry: { layout: "stacked", summaryPosition: "right", header: "nav" },
  ile: { layout: "two-column", summaryPosition: "left", header: "nav" },
  plug: { layout: "steps", summaryPosition: "right", header: "logo" },
  stride: { layout: "steps", summaryPosition: "right", header: "nav" },
  ewa: { layout: "two-column", summaryPosition: "right", header: "nav" },
  suku: { layout: "stacked", summaryPosition: "right", header: "nav" },
  asoebi: { layout: "two-column", summaryPosition: "left", header: "nav" },
  agbada: { layout: "two-column", summaryPosition: "left", header: "logo" },
  ileke: { layout: "minimal", summaryPosition: "right", header: "logo" },
  ounje: { layout: "stacked", summaryPosition: "right", header: "nav" },
  chinchin: { layout: "stacked", summaryPosition: "right", header: "nav" },
  oja: { layout: "steps", summaryPosition: "right", header: "nav" },
  omo: { layout: "two-column", summaryPosition: "right", header: "nav" },
  iwe: { layout: "two-column", summaryPosition: "right", header: "nav" },
  owambe: { layout: "steps", summaryPosition: "right", header: "nav" },
  danfo: { layout: "steps", summaryPosition: "right", header: "logo" },
  turare: { layout: "minimal", summaryPosition: "right", header: "logo" },
  oko: { layout: "stacked", summaryPosition: "right", header: "nav" },
  aaro: { layout: "two-column", summaryPosition: "right", header: "logo" },
  highlife: { layout: "steps", summaryPosition: "right", header: "nav" },
  oba: { layout: "minimal", summaryPosition: "right", header: "logo" },
  gbedu: { layout: "steps", summaryPosition: "right", header: "logo" },
  omalicha: { layout: "two-column", summaryPosition: "right", header: "nav" },
  zuma: { layout: "stacked", summaryPosition: "right", header: "nav" },
  oku: { layout: "steps", summaryPosition: "right", header: "nav" },
  ihe: { layout: "minimal", summaryPosition: "right", header: "logo" },
  kasuwa: { layout: "steps", summaryPosition: "right", header: "nav" },
  nkata: { layout: "two-column", summaryPosition: "left", header: "logo" },
  uwa: { layout: "two-column", summaryPosition: "left", header: "nav" },
  sarauniya: { layout: "minimal", summaryPosition: "right", header: "logo" },
  zinariya: { layout: "minimal", summaryPosition: "right", header: "logo" },
};

const FALLBACK_THEME: ThemeDefault = { layout: "two-column", summaryPosition: "right", header: "logo" };

export function checkoutThemeDefaults(themeId: string): ThemeDefault {
  return CHECKOUT_THEME_DEFAULTS[themeId] ?? FALLBACK_THEME;
}

// ─── Classic templates ────────────────────────────────────────────────────────

export type ClassicCheckoutLayout = "single-page" | "multi-step" | "minimal";

/** The classic checkout section layouts, in the order the builder used to offer them; the first is the default. */
export const CLASSIC_CHECKOUT_LAYOUTS: ClassicCheckoutLayout[] = ["single-page", "multi-step", "minimal"];
export const CLASSIC_DEFAULT_CHECKOUT_LAYOUT: ClassicCheckoutLayout = "single-page";

/** What each classic layout becomes on the shared checkout page. */
export const CLASSIC_CHECKOUT_DEFAULTS: Record<ClassicCheckoutLayout, ThemeDefault> = {
  "single-page": { layout: "two-column", summaryPosition: "right", header: "logo" },
  "multi-step": { layout: "steps", summaryPosition: "right", header: "logo" },
  minimal: { layout: "minimal", summaryPosition: "right", header: "logo" },
};

export function classicCheckoutDefaults(legacyLayout: unknown): ThemeDefault {
  return CLASSIC_CHECKOUT_DEFAULTS[oneOf(legacyLayout, CLASSIC_CHECKOUT_LAYOUTS) ?? CLASSIC_DEFAULT_CHECKOUT_LAYOUT];
}

// ─── Reading the settings ─────────────────────────────────────────────────────

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** An ordered list of known ids (duplicates and unknown ids dropped); the fallback when the value isn't a list. */
export function readBlockOrder<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || seen.has(entry) || !(allowed as readonly string[]).includes(entry)) continue;
    seen.add(entry);
    out.push(entry as T);
  }
  return out;
}

interface SectionLike {
  kind?: string;
  settings?: Record<string, unknown>;
  blocks?: Array<{ type?: string; content?: unknown }>;
}

interface SnapshotLike {
  pages?: Array<{ pageType?: string; sections?: SectionLike[] }>;
}

/** The checkout page's checkout-form section, where the checkout settings are stored. */
export function checkoutSectionOf(snapshot: SnapshotLike | null | undefined): SectionLike | null {
  const page = snapshot?.pages?.find((entry) => entry.pageType === "checkout");
  return page?.sections?.find((entry) => entry.kind === "checkout-form") ?? null;
}

const LAYOUTS = CHECKOUT_LAYOUT_OPTIONS.map((option) => option.value);
const BLOCK_IDS = CHECKOUT_SUMMARY_BLOCKS.map((option) => option.value);

function readWith(section: SectionLike | null | undefined, defaults: ThemeDefault): CheckoutPageSettings {
  const settings = record(section?.settings);
  const copy = record(section?.blocks?.find((block) => block.type === "copy")?.content);
  return {
    layout: oneOf(settings.checkoutLayout, LAYOUTS) ?? defaults.layout,
    summaryBlocks: readBlockOrder(settings.summaryBlocks, BLOCK_IDS, DEFAULT_SUMMARY_BLOCKS),
    summaryPosition: oneOf(settings.summaryPosition, ["right", "left"] as const) ?? defaults.summaryPosition,
    header: oneOf(settings.checkoutHeader, ["nav", "logo"] as const) ?? defaults.header,
    thumbnails: bool(settings.summaryThumbnails, true),
    orderNote: bool(settings.orderNote, true),
    message: str(copy.checkoutMessage).slice(0, 280),
    labels: {
      placeOrder: str(copy.placeOrderLabel).slice(0, 40),
      continue: str(copy.continueLabel).slice(0, 40),
      summary: str(copy.summaryTitle).slice(0, 60) || "Order summary",
    },
  };
}

/** Checkout settings from a 2026 theme's checkout-form section, with the theme's defaults for anything not set. */
export function readCheckoutPageSettings(section: SectionLike | null | undefined, themeId: string): CheckoutPageSettings {
  return readWith(section, checkoutThemeDefaults(themeId));
}

/** Checkout settings from a classic template's section: its saved classic `layout` is the starting point. */
export function readClassicCheckoutSettings(section: SectionLike | null | undefined): CheckoutPageSettings {
  return readWith(section, classicCheckoutDefaults(record(section?.settings).layout));
}

/** Checkout settings for a store snapshot (draft in the builder, published on the live store). */
export function checkoutSettingsForSnapshot(snapshot: SnapshotLike | null | undefined, themeId: string, renderer: "boutique" | "classic"): CheckoutPageSettings {
  const section = checkoutSectionOf(snapshot);
  return renderer === "boutique" ? readCheckoutPageSettings(section, themeId) : readClassicCheckoutSettings(section);
}

/** Minimal is always logo only; the other layouts follow the setting. */
export function showsHeaderNav(settings: Pick<CheckoutPageSettings, "layout" | "header">) {
  return settings.layout !== "minimal" && settings.header === "nav";
}

/** Two columns and Steps put the summary beside the form on wide screens; the others fold it at the top. */
export function hasSideSummary(layout: CheckoutLayout) {
  return layout === "two-column" || layout === "steps";
}

// ─── Steps ────────────────────────────────────────────────────────────────────

/** The steps of the Steps layout. Payment is the last one: the shopper places the order from it. */
export const LAYOUT_STEPS = ["contact", "delivery", "payment"] as const satisfies readonly CheckoutStep[];
export type LayoutStep = (typeof LAYOUT_STEPS)[number];

export const LAYOUT_STEP_TITLES: Record<LayoutStep, { title: string; sub: string }> = {
  contact: { title: "Your details", sub: "No account needed. We'll send your receipt and order updates here." },
  delivery: { title: "Where should we deliver?", sub: "Your address and how you'd like to get your order." },
  payment: { title: "How would you like to pay?", sub: "Check your details, choose how to pay and place your order." },
};

/** Steps the form is split into: three for Steps, none (one page) for the other layouts. */
export function stepsFor(layout: CheckoutLayout): LayoutStep[] {
  return layout === "steps" ? [...LAYOUT_STEPS] : [];
}

type Choice = { deliveryOptionId?: string | null; paymentMethod?: string | null };

/** Field errors for several steps at once, in page order (contact, then delivery, then payment). */
export function errorsForSteps(steps: readonly CheckoutStep[], details: CheckoutDetails, rules: CheckoutRules, choice: Choice = {}): FieldErrors {
  const out: FieldErrors = {};
  for (const step of steps) {
    for (const [key, message] of Object.entries(stepErrors(step, details, rules, choice))) {
      const field = key as keyof FieldErrors;
      if (message && !out[field]) out[field] = message;
    }
  }
  return out;
}

/** The first of these steps with something missing, or -1 when all are complete. */
export function firstStepWithErrors(steps: readonly CheckoutStep[], details: CheckoutDetails, rules: CheckoutRules, choice: Choice = {}): number {
  return steps.findIndex((step) => Object.keys(stepErrors(step, details, rules, choice)).length > 0);
}

/**
 * Where a returning shopper (details saved on this device) starts on the Steps layout: the first step that still
 * needs something, at most the payment step.
 */
export function resumeStepIndex(details: CheckoutDetails, rules: CheckoutRules, choice: Choice = {}): number {
  const index = firstStepWithErrors(LAYOUT_STEPS, details, rules, choice);
  return index < 0 ? LAYOUT_STEPS.length - 1 : index;
}

/** The step a shopper has reached, for abandoned-cart reminders ("review" when every part is filled in). */
export function reachedCheckoutStep(details: CheckoutDetails, rules: CheckoutRules, choice: Choice = {}): CheckoutStep {
  const index = firstStepWithErrors(LAYOUT_STEPS, details, rules, choice);
  return index < 0 ? "review" : LAYOUT_STEPS[index]!;
}

/** Whole-percent progress through the steps (the current step counts as reached). */
export function stepProgress(current: number, total: number) {
  if (total <= 0) return 100;
  return Math.round((Math.min(Math.max(current, 0), total - 1) + 1) / total * 100);
}

/** Labels for the fields errors can point at, in the order they appear on the page. */
export const CHECKOUT_FIELD_LABELS: Array<[keyof FieldErrors, string]> = [
  ["name", "Full name"],
  ["email", "Email"],
  ["phone", "Phone number"],
  ["street", "Street address"],
  ["state", "State"],
  ["city", "Area or city"],
  ["deliveryOption", "Delivery option"],
  ["paymentMethod", "Payment method"],
];

/** Fields with errors, in page order (for focusing the first one and the error summary). */
export function errorFields(errors: FieldErrors): Array<keyof FieldErrors> {
  return CHECKOUT_FIELD_LABELS.map(([key]) => key).filter((key) => Boolean(errors[key]));
}

/** "Check 2 things: Full name, Email." for the announced error summary; empty when nothing is wrong. */
export function errorSummaryText(errors: FieldErrors): string {
  const labels = errorFields(errors).map((key) => CHECKOUT_FIELD_LABELS.find(([field]) => field === key)![1]);
  if (!labels.length) return "";
  return labels.length === 1 ? `Check ${labels[0]!.toLowerCase()}: ${errors[errorFields(errors)[0]!]}` : `Check ${labels.length} things: ${labels.join(", ")}.`;
}

/** The label on the continue button: the seller's own, else "Continue to <next step>". */
export function continueLabel(settings: Pick<CheckoutPageSettings, "labels">, nextStep: LayoutStep | undefined) {
  if (settings.labels.continue) return settings.labels.continue;
  return nextStep ? `Continue to ${nextStep}` : "Continue";
}

/** The label on the final button: the seller's own, else "Pay ₦…" for card payments and "Place order" otherwise. */
export function placeOrderLabel(settings: Pick<CheckoutPageSettings, "labels">, input: { paystack: boolean; total: number; currency: string }) {
  if (settings.labels.placeOrder) return settings.labels.placeOrder;
  return input.paystack ? `Pay ${formatStoreMoney(input.total, input.currency)}` : "Place order";
}

// ─── Order summary blocks ─────────────────────────────────────────────────────

/** What each summary block needs from the store; a block whose data is missing stays hidden on the live store. */
export interface SummaryBlockContext {
  /** Discount codes are on in Checkout settings. */
  coupon: boolean;
  /** Trust badges are on in Checkout settings. */
  trustEnabled: boolean;
  trustCount: number;
  deliveryEstimate: string | null;
  whatsapp: boolean;
  returns: boolean;
}

/** Why a block can't show yet (shown as a hint in the builder), or null when it can. */
export function summaryBlockMissing(block: CheckoutSummaryBlock, context: SummaryBlockContext): string | null {
  switch (block) {
    case "discount":
      return context.coupon ? null : "Turn on discount codes in Checkout settings to show the code box.";
    case "trust":
      if (!context.trustEnabled) return "Trust badges are off in Checkout settings.";
      return context.trustCount > 0 ? null : "Trust badges come from your delivery and payment settings (none set yet).";
    case "delivery":
      return context.deliveryEstimate ? null : "Add delivery times to your delivery zones to show an estimate.";
    case "whatsapp":
      return context.whatsapp ? null : "Add a WhatsApp number in Chat settings to show a help link.";
    case "returns":
      return context.returns ? null : "Publish a returns policy (Policies) to link to it here.";
    default:
      return null;
  }
}

/** The blocks that show, in the seller's order. */
export function visibleSummaryBlocks(blocks: readonly CheckoutSummaryBlock[], context: SummaryBlockContext): CheckoutSummaryBlock[] {
  return blocks.filter((block) => summaryBlockMissing(block, context) === null);
}

/** The blocks above the totals (items and discount code, in their order) and the blocks below them. */
export function splitSummaryBlocks<T extends string>(blocks: readonly T[]): { beforeTotals: T[]; afterTotals: T[] } {
  const top = new Set<string>(["items", "discount"]);
  return { beforeTotals: blocks.filter((block) => top.has(block)), afterTotals: blocks.filter((block) => !top.has(block)) };
}

export interface CheckoutTrustBadge {
  id: "delivery" | "payOnDelivery" | "payments";
  icon: "truck" | "card" | "shield";
  title: string;
}

/** Trust badges from the seller's own settings: nothing is promised that the store hasn't set up. */
export function checkoutTrustBadges(shopper: Pick<StorefrontShopperInfo, "delivery" | "flatRate" | "payOnDelivery" | "paymentLabels">, currency = "NGN"): CheckoutTrustBadge[] {
  const badges: CheckoutTrustBadge[] = [];
  const everywhere = freeDeliveryEverywhereOver(shopper.delivery);
  const delivery = everywhere !== null
    ? `Free delivery over ${formatStoreMoney(everywhere, currency)}`
    : freeDeliveryPromise(shopper.delivery) ?? (shopper.delivery.some((zone) => !zone.pickupOnly) || shopper.flatRate !== null ? "Delivery to your door" : "");
  if (delivery) badges.push({ id: "delivery", icon: "truck", title: delivery });
  if (shopper.payOnDelivery) badges.push({ id: "payOnDelivery", icon: "card", title: "Pay on delivery" });
  const ways = shopper.paymentLabels.filter((label) => label !== "Pay on delivery" && label !== "USSD");
  if (ways.length) badges.push({ id: "payments", icon: "shield", title: `Pay by ${ways.join(" or ").toLowerCase()}` });
  return badges;
}

/** "Secure checkout" with the ways to pay online. */
export function secureCheckoutText(paymentLabels: readonly string[]) {
  const ways = paymentLabels.filter((label) => label !== "Pay on delivery");
  return `Secure checkout${ways.length ? `: ${ways.join(", ")}` : ""}`;
}

/**
 * How long delivery takes: the chosen option's time once the shopper picked one, else the times the seller set on
 * their zones ("Usually 1-2 days", or "1-2 days in Lagos, 3-5 days elsewhere"). Null when no times are set.
 */
export function deliveryEstimateText(shopper: Pick<StorefrontShopperInfo, "delivery">, chosen?: { estimatedDays: string | null; pickup?: boolean } | null): string | null {
  if (chosen?.estimatedDays) return `${chosen.pickup ? "Ready to collect" : "Arrives"} in ${chosen.estimatedDays}`;
  const zones = shopper.delivery.filter((zone) => !zone.pickupOnly && zone.estimatedDays);
  if (!zones.length) return null;
  const times = [...new Set(zones.map((zone) => zone.estimatedDays!))];
  if (times.length === 1) return `Usually delivered in ${times[0]}`;
  return zones
    .slice(0, 3)
    .map((zone) => `${zone.estimatedDays} ${zone.regions.length === 0 ? "elsewhere" : `in ${zone.regions.length === 1 ? zone.regions[0] : zone.name}`}`)
    .join(", ");
}

/** WhatsApp chat link for help with an order; null without a number. */
export function whatsappHelpHref(digits: string | null | undefined, storeName: string): string | null {
  return digits ? whatsappLink(digits, `Hi ${storeName}, I need help with my order.`) : null;
}

// ─── Header links ─────────────────────────────────────────────────────────────

const NAV_LABELS: Record<string, string> = { home: "Home", products: "Shop", about: "About", contact: "Contact", faq: "FAQ" };

/** The store's header links (the home page header's), for the checkout header when it shows them. */
export function checkoutNavLinks(snapshot: SnapshotLike | null | undefined): Array<{ key: string; label: string }> {
  const pages = snapshot?.pages ?? [];
  if (!pages.length) return [];
  const home =pages.find((page) => page.pageType === "home") ?? pages[0];
  const header = home?.sections?.find((section) => section.kind === "header");
  const copy = record(header?.blocks?.find((block) => block.type === "copy")?.content);
  const pageTypes = new Set(pages.map((page) => String(page.pageType)));
  const keys = Array.isArray(copy.navLinks) ? (copy.navLinks as unknown[]).map((entry) => (String(entry) === "shop" ? "products" : String(entry))) : ["home", "products", "about", "contact"];
  return keys
    .filter((key, index, all) => NAV_LABELS[key] && (key === "home" || pageTypes.has(key)) && all.indexOf(key) === index)
    .slice(0, 5)
    .map((key) => ({ key, label: NAV_LABELS[key]! }));
}

// ─── Builder preview ──────────────────────────────────────────────────────────

/**
 * The bag the builder's checkout preview shows: the store's own products (those with a photo first, up to `max`),
 * or clearly marked sample items when the store has none yet.
 */
export function previewBag(products: ReadonlyArray<{ id: string; name: string; images?: string[] | null; retailPrice?: number | null }>, max = 2): { lines: CartLine[]; sample: boolean } {
  const real = products.filter((product) => product.name && typeof product.retailPrice === "number" && product.retailPrice >= 0);
  const ordered = [...real.filter((product) => product.images?.[0]), ...real.filter((product) => !product.images?.[0])].slice(0, max);
  if (ordered.length) {
    return { lines: ordered.map((product, index) => ({ productId: product.id, name: product.name, price: product.retailPrice!, quantity: index === 0 ? 1 : 2, image: product.images?.[0] ?? undefined })), sample: false };
  }
  return {
    lines: [
      { productId: "sample-1", name: "Sample item", price: 12_500, quantity: 1 },
      { productId: "sample-2", name: "Another sample item", price: 8_000, quantity: 2 },
    ],
    sample: true,
  };
}

/** Payment methods the preview shows, from the buyer-facing labels the store's settings give (Card, Transfer…). */
export function previewPaymentMethods(shopper: Pick<StorefrontShopperInfo, "paymentLabels" | "payOnDelivery">): { card: boolean; transfer: boolean; cod: boolean } | null {
  const card = shopper.paymentLabels.includes("Card");
  const transfer = shopper.paymentLabels.includes("Transfer");
  const cod = shopper.payOnDelivery;
  return card || transfer || cod ? { card, transfer, cod } : null;
}
