// Every price and fee Shopinbos itself charges, in one place (Admin › Pricing, /admin/pricing). Each setting has a
// default (today's number, or its old environment variable) that applies until an admin saves a value; saved values
// live in PlatformSetting with a history in PlatformSettingChange (src/lib/pricing/price-book.server.ts).
// Pure, so web pages, the phone app, server code and tests/platform-pricing.test.mjs share it.
//
// Not here, on purpose: subscription plans (priced in Paystack), print-order price tables, and anything delivery
// partners or suppliers set themselves.

export type PriceUnit = "naira" | "percent" | "credits" | "usd" | "naira_per_usd" | "months";

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
  store_fee: { title: "Fee on store sales", sub: "Shopinbos's cut of each card or online bank order, by the seller's plan, taken in the checkout split. Not charged on delivery or on dropship items (the supplier's commission covers those)." },
  supplier_fee: { title: "Supplier commission", sub: "Shopinbos's commission on each marketplace order (of the wholesale value), by the supplier's plan, taken from the supplier's share in the checkout split." },
  delivery: { title: "Logistics job fee", sub: "Shopinbos's fee on each in-app delivery job (of the delivery fee), by the partner's plan, taken from the partner's share. Off until switched on." },
  credits: { title: "AI credits", sub: "Credit packs anyone can buy (they last 12 months), credits new accounts start with, and what each AI action costs. Plans' monthly credits are in Plans." },
  join: { title: "Join offer", sub: "Free months of the first paid plan for every new account, on top of the signup credits. 0 is off. Gifts for one person are in Gifts and free plans." },
  boosts: { title: "Featured placement and boosts", sub: "Pay-per-use visibility for suppliers and delivery partners, bought by the week. Pro plans include some featured time." },
  addons: { title: "Add-ons", sub: "SMS and WhatsApp message packs and extra staff seats for sellers." },
  ads: { title: "Ad campaigns", sub: "Setup fee when the Shopinbos team runs a campaign. Ad spend is paid to Meta / TikTok, not to us." },
  domains: { title: "Domains", sub: "Price = registrar's USD price × exchange rate + markup, rounded up to the next ₦500." },
  themes: { title: "Store themes", sub: "One-time price to unlock a single premium or platinum theme without changing plan. Starter includes premium themes; Growth and Seller Pro include all of them." },
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
const pct = (group: PriceGroup, label: string, value: number, extra: Partial<NumberSetting> = {}): NumberSetting => ({
  kind: "number",
  group,
  label,
  unit: "percent",
  default: value,
  min: 0,
  max: 30,
  ...extra,
});
const months = (label: string, value: number): NumberSetting => ({ kind: "number", group: "join", label, unit: "months", default: value, min: 0, max: 12, integer: true });
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
  // The store-sales fee (src/lib/wallet/rules.ts platformFeeKobo), by the seller's plan (shared/plans.ts).
  "store_fee.free": pct("store_fee", "Free plan", 3, { hint: "Percent of the order, not counting delivery." }),
  "store_fee.starter": pct("store_fee", "Starter plan", 2),
  "store_fee.growth": pct("store_fee", "Growth plan", 1),
  "store_fee.pro": pct("store_fee", "Pro plan", 0.5),
  "store_fee.min": naira("store_fee", "Smallest fee per order", 0, { hint: "0 = no minimum." }),
  "store_fee.max": naira("store_fee", "Largest fee per order", 0, { hint: "0 = no maximum." }),

  "supplier_fee.free": pct("supplier_fee", "Free (Verified)", 6, { hint: "Percent of the wholesale value of each marketplace order." }),
  "supplier_fee.plus": pct("supplier_fee", "Supplier Plus", 4),
  "supplier_fee.pro": pct("supplier_fee", "Supplier Pro", 3),

  "delivery.enabled": {
    kind: "choice",
    group: "delivery",
    label: "Charge the job fee",
    hint: "Off at launch to grow the delivery network. Partners see what it would be either way.",
    default: "off",
    choices: [
      { value: "off", label: "Off (0%)" },
      { value: "on", label: "On" },
    ],
  },
  "delivery.free": pct("delivery", "Free (Verified)", 5, { hint: "Percent of the delivery fee." }),
  "delivery.plus": pct("delivery", "Logistics Plus", 3),
  "delivery.pro": pct("delivery", "Logistics Pro", 2),

  "credits.small.credits": credits("Small pack: credits", 200, { min: 1 }),
  "credits.small.naira": naira("credits", "Small pack: price", 2_000, { min: 100 }),
  "credits.medium.credits": credits("Medium pack: credits", 550, { min: 1 }),
  "credits.medium.naira": naira("credits", "Medium pack: price", 5_000, { min: 100 }),
  "credits.large.credits": credits("Large pack: credits", 1_200, { min: 1 }),
  "credits.large.naira": naira("credits", "Large pack: price", 10_000, { min: 100 }),
  "credits.business.credits": credits("Business pack: credits", 3_200, { min: 1 }),
  "credits.business.naira": naira("credits", "Business pack: price", 25_000, { min: 100 }),
  "credits.welcome": credits("Signup bonus for every new account", 50),
  // What each kind of request costs when it isn't one of the actions below.
  "credits.cost.text": credits("Cost: other writing / chat message", 1, { min: 1 }),
  "credits.cost.speech": credits("Cost: voice typing", 1, { min: 1 }),
  "credits.cost.voice": credits("Cost: voiceover", 2, { min: 1 }),
  "credits.cost.image": credits("Cost: other picture", 10, { min: 1 }),
  "credits.cost.build": credits("Cost: AI store setup (theme, sections, sample copy)", 20, { min: 1 }),
  "credits.cost.video": credits("Cost: video", 10, { min: 1 }),
  // Actions (shared/ai-credits.ts CREDIT_ACTIONS): each button shows its cost before it's used.
  "credits.cost.product_copy": credits("Cost: product title + description", 2, { min: 1 }),
  "credits.cost.seo": credits("Cost: SEO tags / meta description", 1, { min: 1 }),
  "credits.cost.bg_remove": credits("Cost: remove image background", 3, { min: 1 }),
  "credits.cost.photo": credits("Cost: enhance or generate a lifestyle product photo", 10, { min: 1 }),
  "credits.cost.caption": credits("Cost: social caption or ad copy", 2, { min: 1 }),
  "credits.cost.translate": credits("Cost: translate a listing", 1, { min: 1 }),
  "credits.cost.campaign": credits("Cost: seasonal campaign builder", 10, { min: 1 }),
  "credits.cost.chat_reply": credits("Cost: AI customer chat reply (per conversation)", 1, { min: 1 }),
  "credits.cost.insights": credits("Cost: sales insights report", 5, { min: 1 }),
  "credits.cost.bulk_description": credits("Cost (suppliers): bulk product description, per product", 1, { min: 1 }),
  "credits.cost.auto_tag": credits("Cost (suppliers): categorise and tag, per 5 products", 1, { min: 1 }),
  "credits.cost.import_cleanup": credits("Cost (suppliers): clean up / translate an imported listing, per product", 2, { min: 1 }),
  "credits.cost.photo_cleanup": credits("Cost (suppliers): product photo cleanup", 3, { min: 1 }),
  "credits.cost.inquiry_reply": credits("Cost (suppliers): buyer inquiry auto-reply (per conversation)", 1, { min: 1 }),
  "credits.cost.rate_card": credits("Cost (logistics): build a rate card from a price list", 10, { min: 1 }),
  "credits.cost.coverage_listing": credits("Cost (logistics): coverage and pickup point listings", 5, { min: 1 }),
  "credits.cost.performance_report": credits("Cost (logistics): performance summary report", 5, { min: 1 }),
  "credits.cost.store_design": credits("Cost: apply a Rex design in the store builder (menu, section, layout)", 3, { min: 1 }),

  // Every new account (src/lib/admin/gifts.server.ts giveJoinOffer), once, when it's created.
  "join.seller_months": months("New sellers: free months of Starter", 0),
  "join.supplier_months": months("New suppliers: free months of Supplier Plus", 0),
  "join.logistics_months": months("New delivery partners: free months of Logistics Plus", 0),

  "boosts.supplier_week": naira("boosts", "Featured supplier on the sellers' marketplace home, per week", 3_000, { min: 100 }),
  "boosts.logistics_state_week": naira("boosts", "Featured delivery partner in a state's results, per week per state", 2_000, { min: 100 }),
  "boosts.product_week": naira("boosts", "Boosted product in supplier search, per week per product", 1_000, { min: 100 }),

  "addons.sms_pack": naira("addons", "SMS pack (500 messages)", 4_000, { min: 100 }),
  "addons.whatsapp_pack": naira("addons", "WhatsApp pack (500 messages)", 5_000, { min: 100 }),
  "addons.staff_seat": naira("addons", "Extra staff seat, per month", 1_000, { min: 100 }),

  "ads.setup.meta": naira("ads", "Setup fee: Facebook & Instagram", 20_000),
  "ads.setup.tiktok": naira("ads", "Setup fee: TikTok", 30_000),
  "ads.min_daily_budget": naira("ads", "Smallest daily ad budget", 1_000, { min: 100 }),

  "domains.usd_rate": { kind: "number", group: "domains", label: "Exchange rate", unit: "naira_per_usd", default: 1_650, env: "DOMAIN_USD_NGN_RATE", min: 100, max: 100_000 },
  "domains.markup": naira("domains", "Markup per domain", 3_000, { env: "DOMAIN_MARKUP_NGN" }),
  "domains.max_usd": { kind: "number", group: "domains", label: "Most we'll pay the registrar", unit: "usd", default: 20, env: "DOMAIN_PURCHASE_MAX_USD", min: 1, max: 1_000, hint: "Pricier domains aren't offered." },

  "themes.premium": naira("themes", "One premium theme", 2_000, { min: 100 }),
  "themes.platinum": naira("themes", "One platinum theme", 3_000, { min: 100 }),

  // CAC charges ₦27,000 per business name filing (VAS pricing, October 2026) and Paystack takes ~1.5% + ₦100.
  "business.bn_registration": naira("business", "Business name registration", 32_000, { min: 28_000, hint: "CAC charges ₦27,000 per filing from the VAS wallet, and Paystack's fee comes off this. Keep it above both." }),

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
 * phase 2) win over saved values.
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
  return book as PriceBook;
}

// ─── Reading the book ─────────────────────────────────────────────────────────

export const CREDIT_PACK_IDS = ["small", "medium", "large", "business"] as const;

export interface CreditPackPrice {
  id: (typeof CREDIT_PACK_IDS)[number];
  credits: number;
  naira: number;
}

export function creditPackPrices(book: PriceBook): CreditPackPrice[] {
  return CREDIT_PACK_IDS.map((id) => ({ id, credits: book[`credits.${id}.credits`], naira: book[`credits.${id}.naira`] }));
}

/** Every `credits.cost.*` setting as { kind or action: credits }. */
export function creditCosts(book: PriceBook): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of PRICE_KEYS) if (key.startsWith("credits.cost.")) out[key.slice("credits.cost.".length)] = book[key] as number;
  return out;
}

export function adSetupFees(book: PriceBook) {
  return { meta: book["ads.setup.meta"], tiktok: book["ads.setup.tiktok"] };
}

/** Setup fees and the smallest naira daily budget (the web wizard, the phone app and the server all use these). */
export function adPrices(book: PriceBook) {
  return { setup: adSetupFees(book), minDailyNgn: book["ads.min_daily_budget"] };
}

const PLAN_SUFFIX = { seller_free: "free", seller_starter: "starter", seller_growth: "growth", seller_pro: "pro", supplier_free: "free", supplier_plus: "plus", supplier_pro: "pro", logistics_free: "free", logistics_plus: "plus", logistics_pro: "pro" } as const;

/** The store-sales fee for a seller's plan (shared/plans.ts keys), with the per-order floor and cap. */
export function storeFeeConfig(book: PriceBook, plan: keyof typeof PLAN_SUFFIX = "seller_free") {
  const suffix = PLAN_SUFFIX[plan] as "free" | "starter" | "growth" | "pro";
  const rate = plan.startsWith("seller_") ? (book[`store_fee.${suffix}`] as number) : (book["store_fee.free"] as number);
  return { rate, minFee: book["store_fee.min"], maxFee: book["store_fee.max"] };
}

/** The supplier's commission on marketplace orders for their plan. */
export function supplierCommissionPct(book: PriceBook, plan: keyof typeof PLAN_SUFFIX = "supplier_free") {
  const suffix = plan.startsWith("supplier_") ? (PLAN_SUFFIX[plan] as "free" | "plus" | "pro") : "free";
  return book[`supplier_fee.${suffix}`] as number;
}

/** The logistics job fee for a partner's plan: what it would be, and whether it is charged now. */
export function logisticsJobFee(book: PriceBook, plan: keyof typeof PLAN_SUFFIX = "logistics_free") {
  const suffix = plan.startsWith("logistics_") ? (PLAN_SUFFIX[plan] as "free" | "plus" | "pro") : "free";
  const rate = book[`delivery.${suffix}`] as number;
  const charged = book["delivery.enabled"] === "on";
  return { rate, charged, effectiveRate: charged ? rate : 0 };
}

export function boostPrices(book: PriceBook) {
  return { supplierWeek: book["boosts.supplier_week"] as number, logisticsStateWeek: book["boosts.logistics_state_week"] as number, productWeek: book["boosts.product_week"] as number };
}

export function addonPrices(book: PriceBook) {
  return { smsPack: book["addons.sms_pack"] as number, whatsappPack: book["addons.whatsapp_pack"] as number, staffSeat: book["addons.staff_seat"] as number };
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
    case "months":
      return number ? `${number} month${number === 1 ? "" : "s"}` : "Off";
  }
}
