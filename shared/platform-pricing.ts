// Every price and fee Shopinbos itself charges, in one place (Admin › Pricing, /admin/pricing). Each setting has a
// default (today's number, or its old environment variable) that applies until an admin saves a value; saved values
// live in PlatformSetting with a history in PlatformSettingChange (src/lib/pricing/price-book.server.ts).
// Pure, so web pages, the phone app, server code and tests/platform-pricing.test.mjs share it.
//
// Not here, on purpose: subscription plans (priced in Paystack), print-order price tables, and anything delivery
// partners or suppliers set themselves.

export type PriceUnit = "naira" | "percent" | "credits" | "usd" | "naira_per_usd";

export interface NumberSetting {
  kind: "number";
  group: PriceGroup;
  label: string;
  hint?: string;
  unit: PriceUnit;
  default: number;
  /** Environment variable that used to set it; still the default when set. */
  env?: string;
  min: number;
  max: number;
  /** Whole numbers only (naira, credits). */
  integer?: boolean;
}

export interface ChoiceSetting {
  kind: "choice";
  group: PriceGroup;
  label: string;
  hint?: string;
  default: string;
  choices: ReadonlyArray<{ value: string; label: string }>;
}

export type PriceSetting = NumberSetting | ChoiceSetting;

export const PRICE_GROUPS = {
  store_fee: { title: "Fee on store sales", sub: "Shopinbos's cut of each card or online bank order, taken in the checkout split. Not charged on delivery." },
  launch: { title: "Store launch fee", sub: "One-time fee to publish a store. Sellers can pay a deposit now and the rest by month end." },
  credits: { title: "AI credits", sub: "Credit packs sellers and suppliers buy, credits new accounts start with, and what each request costs." },
  ads: { title: "Ad campaigns", sub: "Setup fee when the Shopinbos team runs a campaign. Ad spend is paid to Meta / TikTok, not to us." },
  domains: { title: "Domains", sub: "Price = registrar's USD price × exchange rate + markup, rounded up to the next ₦500." },
  delivery: { title: "Delivery partners", sub: "Shown to delivery partners on their billing page. Not charged on bookings yet." },
  business: { title: "Business registration", sub: "What a business pays to register its business name with CAC through Shopinbos. CAC's fee is paid from the Shopinbos VAS wallet, so keep this above it." },
} as const;
export type PriceGroup = keyof typeof PRICE_GROUPS;

const naira = (group: PriceGroup, label: string, value: number, extra: Partial<NumberSetting> = {}): NumberSetting => ({
  kind: "number",
  group,
  label,
  unit: "naira",
  default: value,
  min: 0,
  max: 10_000_000,
  integer: true,
  ...extra,
});
const credits = (label: string, value: number, extra: Partial<NumberSetting> = {}): NumberSetting => ({
  kind: "number",
  group: "credits",
  label,
  unit: "credits",
  default: value,
  min: 0,
  max: 100_000,
  integer: true,
  ...extra,
});

export const PRICE_SETTINGS = {
  // The store-sales fee (src/lib/wallet/rules.ts platformFeeKobo). Defaults to none: the migration copies the live
  // PlatformFeeConfig values in.
  "store_fee.rate": { kind: "number", group: "store_fee", label: "Fee on each sale", unit: "percent", default: 0, min: 0, max: 30, hint: "Percent of the order, not counting delivery." },
  "store_fee.min": naira("store_fee", "Smallest fee per order", 0, { hint: "0 = no minimum." }),
  "store_fee.max": naira("store_fee", "Largest fee per order", 0, { hint: "0 = no maximum." }),

  "launch.price": naira("launch", "Launch fee", 8_000, { env: "STORE_LAUNCH_PRICE_NGN", min: 100 }),
  "launch.deposit": naira("launch", "Deposit (pay the rest later)", 4_000, { env: "STORE_LAUNCH_DEPOSIT_NGN", min: 100, hint: "Never more than the launch fee." }),

  "credits.small.credits": credits("Quick top-up: credits", 60, { min: 1 }),
  "credits.small.naira": naira("credits", "Quick top-up: price", 2_000, { min: 100 }),
  "credits.medium.credits": credits("Business pack: credits", 200, { min: 1 }),
  "credits.medium.naira": naira("credits", "Business pack: price", 5_500, { min: 100 }),
  "credits.large.credits": credits("Power pack: credits", 600, { min: 1 }),
  "credits.large.naira": naira("credits", "Power pack: price", 14_500, { min: 100 }),
  "credits.welcome": credits("Credits a new account starts with", 5),
  "credits.cost.text": credits("Cost: writing / chat message", 1, { min: 1 }),
  "credits.cost.speech": credits("Cost: voiceover", 1, { min: 1 }),
  "credits.cost.voice": credits("Cost: voice note to Peggy / Rex", 2, { min: 1 }),
  "credits.cost.image": credits("Cost: picture", 5, { min: 1 }),
  "credits.cost.build": credits("Cost: building a store", 15, { min: 1 }),
  "credits.cost.video": credits("Cost: video", 10, { min: 1 }),

  "ads.setup.meta": naira("ads", "Setup fee: Facebook & Instagram", 20_000),
  "ads.setup.tiktok": naira("ads", "Setup fee: TikTok", 30_000),
  "ads.min_daily_budget": naira("ads", "Smallest daily ad budget", 1_000, { min: 100 }),

  "domains.usd_rate": { kind: "number", group: "domains", label: "Exchange rate", unit: "naira_per_usd", default: 1_650, env: "DOMAIN_USD_NGN_RATE", min: 100, max: 100_000 },
  "domains.markup": naira("domains", "Markup per domain", 3_000, { env: "DOMAIN_MARKUP_NGN" }),
  "domains.max_usd": { kind: "number", group: "domains", label: "Most we'll pay the registrar", unit: "usd", default: 20, env: "DOMAIN_PURCHASE_MAX_USD", min: 1, max: 1_000, hint: "Pricier domains aren't offered." },

  // CAC charges ₦27,000 per business name filing (VAS pricing, October 2026) and Paystack takes ~1.5% + ₦100.
  "business.bn_registration": naira("business", "Business name registration", 32_000, { min: 28_000, hint: "CAC charges ₦27,000 per filing from the VAS wallet, and Paystack's fee comes off this. Keep it above both." }),

  "delivery.fee_rate": { kind: "number", group: "delivery", label: "Fee on each delivery", unit: "percent", default: 1.5, min: 0, max: 30 },
  "delivery.fee_bearer": {
    kind: "choice",
    group: "delivery",
    label: "Who pays it",
    default: "seller",
    choices: [
      { value: "seller", label: "The seller" },
      { value: "supplier", label: "The supplier" },
      { value: "logistics_partner", label: "The delivery partner" },
    ],
  },
} as const satisfies Record<string, PriceSetting>;

export type PriceKey = keyof typeof PRICE_SETTINGS;
export type PriceBook = { [K in PriceKey]: (typeof PRICE_SETTINGS)[K] extends ChoiceSetting ? string : number };

export const PRICE_KEYS = Object.keys(PRICE_SETTINGS) as PriceKey[];

export function isPriceKey(key: unknown): key is PriceKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(PRICE_SETTINGS, key);
}

/** A valid value for this setting, or null (out of range, not a number, not one of the choices). */
export function cleanPriceValue(key: PriceKey, raw: unknown): number | string | null {
  const setting: PriceSetting = PRICE_SETTINGS[key];
  if (setting.kind === "choice") {
    return typeof raw === "string" && setting.choices.some((choice) => choice.value === raw) ? raw : null;
  }
  const number = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw.replace(/[,\s₦]/g, "")) : NaN;
  if (!Number.isFinite(number) || number < setting.min || number > setting.max) return null;
  if (setting.integer && !Number.isInteger(number)) return null;
  return Math.round(number * 10_000) / 10_000;
}

/** Today's default: the old environment variable when set and valid, else the built-in number. */
export function defaultPrice(key: PriceKey, env: Record<string, string | undefined> = {}): number | string {
  const setting: PriceSetting = PRICE_SETTINGS[key];
  if (setting.kind === "number" && setting.env) {
    const fromEnv = cleanPriceValue(key, env[setting.env]);
    if (fromEnv !== null) return fromEnv;
  }
  return setting.default;
}

/**
 * The full price book: saved values where they're valid, defaults for the rest. `overrides` (a promotion's prices,
 * phase 2) win over saved values. Cross-field rules are applied last (the deposit never exceeds the launch fee).
 */
export function resolvePriceBook(
  saved: Partial<Record<string, unknown>>,
  env: Record<string, string | undefined> = {},
  overrides: Partial<Record<string, unknown>> = {},
): PriceBook {
  const book = {} as Record<PriceKey, number | string>;
  for (const key of PRICE_KEYS) {
    const override = key in overrides ? cleanPriceValue(key, overrides[key]) : null;
    const stored = key in saved ? cleanPriceValue(key, saved[key]) : null;
    book[key] = override ?? stored ?? defaultPrice(key, env);
  }
  book["launch.deposit"] = Math.min(book["launch.deposit"] as number, book["launch.price"] as number);
  return book as PriceBook;
}

// ─── Reading the book ─────────────────────────────────────────────────────────

export interface CreditPackPrice {
  id: "small" | "medium" | "large";
  credits: number;
  naira: number;
}

export function creditPackPrices(book: PriceBook): CreditPackPrice[] {
  return (["small", "medium", "large"] as const).map((id) => ({ id, credits: book[`credits.${id}.credits`], naira: book[`credits.${id}.naira`] }));
}

export function creditCosts(book: PriceBook) {
  return {
    text: book["credits.cost.text"],
    speech: book["credits.cost.speech"],
    voice: book["credits.cost.voice"],
    image: book["credits.cost.image"],
    build: book["credits.cost.build"],
    video: book["credits.cost.video"],
  };
}

export function adSetupFees(book: PriceBook) {
  return { meta: book["ads.setup.meta"], tiktok: book["ads.setup.tiktok"] };
}

/** Setup fees and the smallest naira daily budget (the web wizard, the phone app and the server all use these). */
export function adPrices(book: PriceBook) {
  return { setup: adSetupFees(book), minDailyNgn: book["ads.min_daily_budget"] };
}

export function storeFeeConfig(book: PriceBook) {
  return { rate: book["store_fee.rate"], minFee: book["store_fee.min"], maxFee: book["store_fee.max"] };
}

/** How a setting's value reads ("₦8,000", "1.5%", "60 credits", "$20", "₦1,650 per $1"). */
export function formatPriceValue(key: PriceKey, value: number | string) {
  const setting: PriceSetting = PRICE_SETTINGS[key];
  if (setting.kind === "choice") return setting.choices.find((choice) => choice.value === value)?.label ?? String(value);
  const number = Number(value);
  switch (setting.unit) {
    case "naira":
      return `₦${number.toLocaleString("en-NG")}`;
    case "percent":
      return `${number}%`;
    case "credits":
      return `${number.toLocaleString("en-NG")} credit${number === 1 ? "" : "s"}`;
    case "usd":
      return `$${number.toLocaleString("en-US")}`;
    case "naira_per_usd":
      return `₦${number.toLocaleString("en-NG")} per $1`;
  }
}
