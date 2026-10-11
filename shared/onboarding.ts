// Seller onboarding content shared by the web app and the Expo app, so both render the same flow.
// Copy follows the 2026 "Seller onboarding" prototype.

export const ONBOARDING_STEPS = ["chat", "brand", "products", "payments", "live", "checklist"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Steps that show the progress bar at the top (the prototype shows five bars). */
export const PROGRESS_STEPS: OnboardingStep[] = ["chat", "brand", "products", "payments", "live"];

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

export const BRAND_LOOKS: BrandLook[] = [
  { key: "adire", label: "Adire", background: "#F3EDE6", ink: "#2A2018", fontCss: "'Fraunces', serif", fontStyle: "fraunces", templateId: "heritage" },
  { key: "stride", label: "Stride", background: "#FFE9DD", ink: "#3A1A08", fontCss: "'Plus Jakarta Sans', sans-serif", fontStyle: "grotesk", templateId: "market" },
  { key: "ile", label: "Ilé", background: "#E8EFEA", ink: "#15322A", fontCss: "'Fraunces', serif", fontStyle: "fraunces", templateId: "glow" },
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
    label: "Spreadsheet or another platform",
    hint: "CSV, Shopify, Bumpa, Catlog",
    note: "Upload a CSV or Excel file. Rex matches the columns and flags anything missing, like prices or photos.",
  },
  {
    key: "sup",
    label: "Pick from suppliers",
    hint: "Dropship, no stock needed",
    note: "Browse verified Nigerian suppliers. Pick products and they appear in your shop with your price; the supplier ships to your customer.",
  },
];

export type PaymentMethodKey = "transfer" | "card" | "cod" | "wa";

export const PAYMENT_METHODS: { key: PaymentMethodKey; label: string; hint: string }[] = [
  { key: "transfer", label: "Bank transfer", hint: "Customers get an account number; confirmed automatically" },
  { key: "card", label: "Card and USSD", hint: "Through Paystack" },
  { key: "cod", label: "Pay on delivery", hint: "Up to ₦50,000, verified phone numbers, where riders cover" },
  { key: "wa", label: "Finish on WhatsApp", hint: "Customers can chat to pay" },
];

export const DEFAULT_PAYMENT_METHODS: Record<PaymentMethodKey, boolean> = { transfer: true, card: true, cod: true, wa: true };

export interface DeliveryZone {
  name: string;
  /** Flat fee in naira; a range shows "from–to". */
  fee: number;
  maxFee?: number;
}

export const DEFAULT_DELIVERY_ZONES: DeliveryZone[] = [
  { name: "Lagos Mainland", fee: 2000 },
  { name: "Lagos Island and Lekki", fee: 2500 },
  { name: "Abuja and other states", fee: 3500, maxFee: 6000 },
];

export type ChecklistKey = "live" | "product" | "brand" | "bank" | "wa" | "id" | "ig" | "labels";

export const CHECKLIST: { key: ChecklistKey; label: string; hint: string; href: string }[] = [
  { key: "live", label: "Go live", hint: "Your shop link works", href: "/home/editor" },
  { key: "product", label: "Add your first products", hint: "One is enough to start", href: "/products" },
  { key: "brand", label: "Pick your brand and look", hint: "Name, colours and template", href: "/home/brand-kit" },
  { key: "bank", label: "Add your payout bank", hint: "Money waits in your balance until you do", href: "/home/payments" },
  { key: "wa", label: "Connect WhatsApp for Peggy", hint: "Peggy drafts replies for you", href: "/home/social/whatsapp" },
  { key: "id", label: "Verify your ID", hint: "BVN or NIN lifts payout limits", href: "/home/profile" },
  { key: "ig", label: "Connect Instagram and TikTok", hint: "Sync your catalogue and posts", href: "/home/social" },
  { key: "labels", label: "Print your first price tags", hint: "Two taps from your products", href: "/products" },
];

export function naira(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

export function zoneFee(zone: DeliveryZone) {
  return zone.maxFee ? `${naira(zone.fee)} to ${naira(zone.maxFee)}` : naira(zone.fee);
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
