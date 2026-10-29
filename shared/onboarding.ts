// Seller onboarding content shared by the web app and the Expo app, so both render the same flow.
// Copy follows the 2026 "Seller onboarding" prototype.

export const ONBOARDING_STEPS = ["chat", "brand", "products", "where", "payments", "live", "checklist"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Steps that show the progress bar at the top ("Where do you sell?" sits before payments). */
export const PROGRESS_STEPS: OnboardingStep[] = ["chat", "brand", "products", "where", "payments", "live"];

export const ONBOARDING_LANGUAGES = ["English", "Pidgin", "Yorùbá", "Igbo", "Hausa"] as const;
export type OnboardingLanguage = (typeof ONBOARDING_LANGUAGES)[number];

export const REX_GREETING: Record<OnboardingLanguage, (name: string) => string> = {
  English: (name) => `Welcome, ${name}! What do you sell, and who buys it?`,
  Pidgin: (name) => `You don land, ${name}! Wetin you dey sell, and who dey buy am?`,
  "Yorùbá": (name) => `Ẹ kú àbọ̀, ${name}! Kí ni ẹ ń tà, ta ló sì ń rà á?`,
  Igbo: (name) => `Nnọọ, ${name}! Gịnị ka ị na-ere, onye na-azụkwa ya?`,
  Hausa: (name) => `Barka da zuwa, ${name}! Me kuke sayarwa, kuma su wa ke saya?`,
};

export const SELL_EXAMPLES: Record<OnboardingLanguage, string> = {
  English: "I sell linen shirts, knits and easy blazers to working women in Lagos and Abuja.",
  Pidgin: "I dey sell linen shirt, knit and blazer for working women for Lagos and Abuja.",
  "Yorùbá": "Mo ń ta ṣẹ́ẹ̀tì linen, aṣọ knit àti blazer fún àwọn obìnrin oníṣẹ́ ní Èkó àti Àbújá.",
  Igbo: "A na m ere uwe linen, knit na blazer nye ụmụ nwanyị na-arụ ọrụ na Lagos na Abuja.",
  Hausa: "Ina sayar da rigar linen, knit da blazer ga mata masu aiki a Lagos da Abuja.",
};

export type StartPath = "own" | "find" | "service";

export const START_PATHS: { key: StartPath; label: string; hint: string; tint: string }[] = [
  { key: "own", label: "I have products", hint: "Set up my store", tint: "#FFEDE4" },
  { key: "find", label: "Find me products", hint: "Dropship or import", tint: "#E2F6F1" },
  { key: "service", label: "Services or digital", hint: "Bookings, courses, ebooks", tint: "#ECEAF2" },
];

export interface BrandPalette {
  key: string;
  label: string;
  /** dark, accent, light */
  swatches: [string, string, string];
}

export const BRAND_PALETTES: BrandPalette[] = [
  { key: "clay", label: "Clay and sand", swatches: ["#2A2018", "#C9744A", "#F3EDE6"] },
  { key: "forest", label: "Forest", swatches: ["#15322A", "#7FA88E", "#E8EFEA"] },
  { key: "indigo", label: "Indigo", swatches: ["#1F2A63", "#F2A71B", "#F3F3F7"] },
];

export type FontStyle = "fraunces" | "grotesk";

export interface BrandLook {
  key: string;
  label: string;
  background: string;
  ink: string;
  /** CSS font stack for the web preview card. */
  fontCss: string;
  /** Font family the store builder understands. */
  fontStyle: FontStyle;
  /** Store builder template this look starts from. */
  templateId: string;
}

/** What "Pick a look" needs of a storefront theme (src/lib/store-templates/theme-library.ts, GET /api/mobile/looks). */
export interface LookTheme {
  id: string;
  name: string;
  preview: { bg: string; ink: string; accent: string; nameFont: "serif" | "sans" | "grotesk"; dark: boolean };
}

/**
 * A library theme as the look and colours the store builder seeds from: the theme's own id and type, and its
 * colours as dark, accent and light (a dark theme's background is its dark colour).
 */
export function lookFromTheme(theme: LookTheme): { look: BrandLook; palette: BrandPalette } {
  const { bg, ink, accent, nameFont, dark } = theme.preview;
  const serif = nameFont === "serif";
  return {
    look: { key: theme.id, label: theme.name, background: bg, ink, fontCss: serif ? "'Fraunces', serif" : "'Plus Jakarta Sans', sans-serif", fontStyle: serif ? "fraunces" : "grotesk", templateId: theme.id },
    palette: { key: theme.id, label: theme.name, swatches: dark ? [bg, accent, ink] : [ink, accent, bg] },
  };
}

/**
 * The ids older phone builds saved for these looks before they pointed at library themes. They match no theme, so
 * stores set up with them got the blank starter; the server reads them as the theme each look stands for.
 */
export const LEGACY_LOOK_THEME_IDS: Readonly<Record<string, string>> = { heritage: "adire", market: "stride", glow: "ile" };

/** The first look screens (still used by the older phone set-up screens); new sign-ups pick from the theme library. */
export const BRAND_LOOKS: BrandLook[] = [
  { key: "adire", label: "Adire", background: "#F3EDE6", ink: "#2A2018", fontCss: "'Fraunces', serif", fontStyle: "fraunces", templateId: "adire" },
  { key: "stride", label: "Stride", background: "#FFE9DD", ink: "#3A1A08", fontCss: "'Plus Jakarta Sans', sans-serif", fontStyle: "grotesk", templateId: "stride" },
  { key: "ile", label: "Ilé", background: "#E8EFEA", ink: "#15322A", fontCss: "'Fraunces', serif", fontStyle: "fraunces", templateId: "ile" },
];

export type ProductDoor = "snap" | "ig" | "file" | "sup";

export const PRODUCT_DOORS: { key: ProductDoor; label: string; hint: string; note: string }[] = [
  {
    key: "snap",
    label: "Snap photos",
    hint: "Rex writes names, prices and descriptions",
    note: "Add a few photos. Rex names each product, suggests a price and writes the description. You check them before anything goes live.",
  },
  {
    key: "ig",
    label: "Import from Instagram",
    hint: "Turn your posts into products",
    note: "Connect Instagram and Rex finds posts that look like products. You review them on one screen before anything goes live.",
  },
  {
    key: "file",
    label: "Import from a CSV or Excel file",
    hint: "A spreadsheet of your products",
    note: "Upload a CSV or Excel file. Rex matches the columns and flags anything missing, like prices or photos.",
  },
  {
    key: "sup",
    label: "Pick from suppliers",
    hint: "Dropship, no stock needed",
    note: "Browse verified Nigerian suppliers. Pick products and they appear in your shop with your price; the supplier ships to your customer.",
  },
];

export type PaymentMethodKey = "transfer" | "card" | "korapay" | "cod" | "wa";

// The switches sellers see. Korapay isn't offered for now (storeTakesKorapay is off), so it isn't listed.
export const PAYMENT_METHODS: { key: PaymentMethodKey; label: string; hint: string }[] = [
  { key: "transfer", label: "Bank transfer", hint: "Each order gets its own account number; paid into your bank and confirmed for you" },
  { key: "card", label: "Card and USSD", hint: "Debit cards and USSD, paid straight into your bank" },
  { key: "cod", label: "Pay on delivery", hint: "Your customer pays you or your rider when it arrives, as you agree" },
  { key: "wa", label: "Finish on WhatsApp", hint: "Customers can chat to pay" },
];

// Korapay starts off: sellers switch it on (it only shows at checkout once their wallet has a Korapay split account).
export const DEFAULT_PAYMENT_METHODS: Record<PaymentMethodKey, boolean> = { transfer: true, card: true, korapay: false, cod: true, wa: true };

/**
 * The methods to save when a step sends some of them: the seller's saved choices (paymentConfig.methods) with the
 * sent ones on top, so a key the step doesn't send (Korapay, switched on from the Money page) is kept, not wiped.
 */
export function mergePaymentMethods(saved: unknown, sent: Partial<Record<PaymentMethodKey, boolean | undefined>>): Partial<Record<PaymentMethodKey, boolean>> {
  const previous = saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  const merged: Partial<Record<PaymentMethodKey, boolean>> = {};
  for (const key of Object.keys(DEFAULT_PAYMENT_METHODS) as PaymentMethodKey[]) {
    const value = typeof sent[key] === "boolean" ? sent[key] : previous[key];
    if (typeof value === "boolean") merged[key] = value;
  }
  return merged;
}

export interface DeliveryZone {
  name: string;
  /** Flat delivery fee in naira. */
  fee: number;
  /**
   * Checkout picks the first zone (by `priority`) whose region appears in the customer's city or state;
   * an empty list matches every address, so it must come last.
   */
  regions: string[];
  priority: number;
}

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { name: "Lagos Mainland", fee: 2000, regions: ["Lagos"], priority: 1 },
  {
    name: "Lagos Island and Lekki",
    fee: 2500,
    regions: ["Lekki", "Victoria Island", "Ikoyi", "Ajah", "Lagos Island", "Oniru", "Sangotedo", "Chevron", "Eko Atlantic"],
    priority: 0,
  },
  { name: "Abuja and other states", fee: 3500, regions: [], priority: 2 },
];

export type ChecklistKey = "live" | "product" | "brand" | "bank" | "delivery" | "wa" | "ig" | "labels";

export const CHECKLIST: { key: ChecklistKey; label: string; hint: string; href: string }[] = [
  { key: "live", label: "Go live", hint: "Your shop link works", href: "/home/editor" },
  { key: "product", label: "Add your first products", hint: "One is enough to start", href: "/products" },
  { key: "brand", label: "Pick your brand and look", hint: "Name, colours and template", href: "/home/brand-kit" },
  { key: "bank", label: "Add your payout bank", hint: "Card payments go straight to your bank", href: "/home/wallet" },
  // Optional on Start here too ("Choose a delivery company"): connects a logistics marketplace partner.
  { key: "delivery", label: "Choose a delivery company", hint: "They pick up parcels and take them to your customers", href: "/home/start?step=partners" },
  { key: "wa", label: "Connect WhatsApp for Peggy", hint: "Peggy drafts replies for you", href: "/home/social/whatsapp" },
  { key: "ig", label: "Connect Instagram and TikTok", hint: "Sync your catalogue and posts", href: "/home/social" },
  { key: "labels", label: "Print your first price tags", hint: "Two taps from your products", href: "/products" },
];

export function naira(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

export function shopSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/** Three name ideas from the seller's own name and what they sell, until Rex suggests better ones. */
export function suggestShopNames(personName: string, description: string): string[] {
  const first = personName.trim().split(/\s+/)[0] || "My";
  const keyword = description
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .find((word) => word.length > 3 && !["sell", "with", "that", "from", "their", "people", "women", "the", "and"].includes(word));
  const noun = keyword ? keyword.charAt(0).toUpperCase() + keyword.slice(1) : "Shop";
  return Array.from(new Set([`${first} Studio`, `${first} and Co.`, `${first}'s ${noun}`]));
}

// ─── "Where do you sell?" (the phone's onboarding step before payments) ─────────
// The same choices as the delivery settings' "Where I sell" (shared/delivery-market.ts SELL_AREAS, saved with
// PUT /api/mobile/delivery/settings like the web's SellAreaPicker): just my state, some states, or all of Nigeria.
// Where a shop sells isn't a plan limit: every plan can sell anywhere, and how far a store reaches online is down to
// the seller (search, ads, social), not Shopinbos.

export type OnboardingSellArea = "one_state" | "selected" | "nationwide";

export interface SellChoice {
  area: OnboardingSellArea;
  states: string[];
}

/** What Continue saves (it is never blocked): a choice with no state yet takes the home state, else Lagos. */
export function sellChoiceToSave(choice: SellChoice, homeState: string | null): SellChoice {
  if (choice.area === "nationwide") return { area: "nationwide", states: [] };
  const states = choice.states.length ? choice.states : [homeState ?? "Lagos"];
  return { area: choice.area, states: choice.area === "one_state" ? states.slice(0, 1) : states };
}

/**
 * The flat delivery fees the payments step starts with, from where the shop sells: the home state, the other chosen
 * states together, and "everywhere else" only when the shop sells across Nigeria.
 */
export function zonesForSellChoice(choice: SellChoice, homeState: string | null): DeliveryZone[] {
  const home = (choice.area === "nationwide" ? homeState : homeState && choice.states.includes(homeState) ? homeState : choice.states[0]) ?? null;
  const zones: DeliveryZone[] = [];
  if (home) zones.push({ name: home, fee: 2000, regions: [home], priority: 0 });
  const others = choice.area === "nationwide" ? [] : choice.states.filter((state) => state !== home);
  if (others.length) zones.push({ name: others.length === 1 ? others[0] : "Other states", fee: 3500, regions: others, priority: 1 });
  if (choice.area === "nationwide") zones.push({ name: "Everywhere else", fee: 3500, regions: [], priority: 2 });
  return zones.length ? zones : [{ name: "Lagos", fee: 2000, regions: ["Lagos"], priority: 0 }];
}

// ─── Sign-up to a live store, one question per screen (2026 "Onboarding — Simplified") ─────────────────────────
// Nine screens, each asking one thing: store name, logo, what you sell, products ready?, first product, its name and
// price, a look, the store address, then "Your store is live!". No ID, bank or CAC on this path: the payout bank and
// delivery are asked later, on Start here. Web (src/components/onboarding/seller/SellerOnboarding.tsx) and phone
// (apps/mobile/src/app/onboarding/index.tsx) both follow these rules; the screen is saved in the onboarding memory
// (screen) after every answer, so a seller who leaves comes back to the same question.

export const SELLER_QUESTIONS = ["name", "logo", "sell", "ready", "product", "details", "look", "address", "live"] as const;
export type SellerQuestion = (typeof SELLER_QUESTIONS)[number];

/** "I have products" or "Find me a supplier" (dropship). */
export type ProductPath = "own" | "dropship";

export function isSellerQuestion(value: unknown): value is SellerQuestion {
  return typeof value === "string" && (SELLER_QUESTIONS as readonly string[]).includes(value);
}

/** "Step 3 of 9": the screen's place in the full list (the dropship path skips "details" but keeps the numbering). */
export function sellerQuestionNumber(question: SellerQuestion) {
  return SELLER_QUESTIONS.indexOf(question) + 1;
}

/** The screen after this one. Dropship sellers pick supplier products, whose name and price come from the supplier. */
export function nextSellerQuestion(question: SellerQuestion, path: ProductPath | null | undefined): SellerQuestion | null {
  if (question === "product" && path === "dropship") return "look";
  const index = SELLER_QUESTIONS.indexOf(question);
  return SELLER_QUESTIONS[index + 1] ?? null;
}

/** The screen the back arrow goes to (null on the first one). */
export function previousSellerQuestion(question: SellerQuestion, path: ProductPath | null | undefined): SellerQuestion | null {
  if (question === "look" && path === "dropship") return "product";
  const index = SELLER_QUESTIONS.indexOf(question);
  return index > 0 ? SELLER_QUESTIONS[index - 1] : null;
}

/** Where a returning seller picks up: the saved screen, else the first one ("chat"/"brand" from the older flow start over). */
export function resumeSellerQuestion(saved: unknown): SellerQuestion {
  return isSellerQuestion(saved) ? saved : "name";
}

/** The selling price suggested for a supplier product: the wholesale price plus 25%, rounded up to ₦100. */
export function suggestedRetailPrice(wholesale: number) {
  if (!Number.isFinite(wholesale) || wholesale <= 0) return 0;
  return Math.ceil((wholesale * 1.25) / 100) * 100;
}

/** "Ada" from "Ada Okafor" (the greeting on the first question). */
export function firstNameOf(name: string | null | undefined) {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Two letters for a logo when Rex can't draw one: "Ada's Kloset" → "AK". */
export function lettermark(storeName: string) {
  const words = storeName.replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "S";
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase();
}

/** What you sell, when the marketplace categories can't be loaded. */
export const FALLBACK_SELL_CATEGORIES = [
  "Fashion",
  "Beauty",
  "Hair and wigs",
  "Shoes and bags",
  "Jewellery",
  "Food and drinks",
  "Home and kitchen",
  "Phones and gadgets",
  "Baby and kids",
  "Health",
  "Fabrics",
  "Other",
] as const;

/**
 * The chips for "What do you sell?" / "What do you supply?": the everyday categories first (the marketplace's own
 * list is only as broad as the catalogues imported so far), then the marketplace's categories not already
 * covered, then "Other".
 */
export function businessCategories(marketplace: readonly string[]): string[] {
  const key = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, " ").trim();
  const starters = FALLBACK_SELL_CATEGORIES.filter((name) => name !== "Other") as string[];
  const seen = new Set(starters.map(key));
  const extra = marketplace.filter((name) => {
    const k = key(name);
    if (!k || seen.has(k) || k === "other") return false;
    seen.add(k);
    return true;
  });
  return [...starters, ...extra, "Other"];
}

/** The free web address before ".shopinbos.com" suggested from the store name. */
export function addressFromName(name: string) {
  return shopSlug(name).slice(0, 40).replace(/-+$/g, "");
}
