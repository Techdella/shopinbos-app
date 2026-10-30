// Seller onboarding on the phone: "Rex builds your shop (step by step)" (design RB-01…RB-16, spec "Seller Onboarding
// Flow: Shopinbos Business (mobile)"). The pure part, shared by the phone (apps/mobile/src/app/onboarding/**), the
// server routes (src/app/api/mobile/onboarding/**) and the tests (tests/seller-onboarding-flow.test.mjs): the screens
// and their order, where a returning seller picks up, the free link's rules, Rex's picks behind "Let Rex choose for
// me", the go-live blockers, the Home "Get your shop ready" list, the analytics events and the nudge rule.
//
// Everything the seller answers is kept on the server in Store.brandSettings.onboardingMemory.rexBuild (no new
// table), so the app reopens on the same screen. Rex builds into the store editor's DRAFT (the same snapshot the
// phone's store editor and the web builder edit, shared/store-editor.ts); "I love it, go live" publishes it.
// Only relative .ts imports, so the tests load this file with Node's type stripping.

import {
  BUTTON_CHOICES,
  FONT_CHOICES,
  THEME_PRESETS,
  addPage,
  applyTokens,
  findPage,
  insertSection,
  isProductsKind,
  pageRows,
  setCopy,
  setPhoto,
  setProductsLayout,
  setProductsShow,
  setSetting,
  toggleSection,
  withNewIds,
  type EdSection,
  type EdSnapshot,
  type ProductsLayout,
  type Renderer,
} from "./store-editor.ts";
import { rexLibraryCategoriesFor, rexLibraryFor } from "./rex-photo-library.ts";

// ─── Screens ─────────────────────────────────────────────────────────────────

/**
 * Every screen in order. B: intro (B1), name (B2), sell (B3), shop (B4). C: choose (C1). D: plan (D0), products
 * (D1a), categories (D1b), style (D2a), colours (D2b), banner (D3a), words (D3b), layout (D3c), sections (D3d),
 * media (D4a), about (D4b), contact (D4c). E: building (E1), review (E2), live (E3).
 */
export const FLOW_SCREENS = [
  "intro",
  "name",
  "sell",
  "shop",
  "choose",
  "plan",
  "products",
  "categories",
  "style",
  "colours",
  "banner",
  "words",
  "layout",
  "sections",
  "media",
  "about",
  "contact",
  "building",
  "review",
  "live",
] as const;
export type FlowScreen = (typeof FLOW_SCREENS)[number];

/** The five steps of Rex's guided build (the 5-segment bar). */
export const BUILD_STEPS = ["products", "style", "home", "pages", "golive"] as const;
export type BuildStep = (typeof BUILD_STEPS)[number];

const STEP_OF: Partial<Record<FlowScreen, number>> = {
  plan: 1,
  products: 1,
  categories: 1,
  style: 2,
  colours: 2,
  banner: 3,
  words: 3,
  layout: 3,
  sections: 3,
  media: 4,
  about: 4,
  contact: 4,
  building: 5,
  review: 5,
};

/** "Step 3 of 5" for a guided-build screen (1-5), or null outside the guided build. */
export function stepOf(screen: FlowScreen): number | null {
  return STEP_OF[screen] ?? null;
}

/** The step's name key (m_rexBuild "step.<name>"). */
export function stepName(step: number): BuildStep {
  return BUILD_STEPS[Math.min(BUILD_STEPS.length, Math.max(1, step)) - 1]!;
}

/** "Shop basics": the three questions before the build (B2–B4), for the small progress bar. */
export const BASICS_SCREENS: FlowScreen[] = ["name", "sell", "shop"];

/**
 * The flow's mode. "start": a new seller. "redesign": My shop › Settings › "Redesign with Rex" re-runs the design
 * steps into the draft (products, orders and contact settings are kept, so those screens are left out).
 */
export type FlowMode = "start" | "redesign";

const REDESIGN_SKIPS: FlowScreen[] = ["intro", "name", "sell", "shop", "choose", "products", "categories", "contact"];

export function isFlowScreen(value: unknown): value is FlowScreen {
  return typeof value === "string" && (FLOW_SCREENS as readonly string[]).includes(value);
}

export function screensFor(mode: FlowMode): FlowScreen[] {
  return mode === "redesign" ? FLOW_SCREENS.filter((screen) => !REDESIGN_SKIPS.includes(screen)) : [...FLOW_SCREENS];
}

/** The screen after this one (null after the last). "I'll design it myself" leaves the flow for the editor. */
export function nextScreen(screen: FlowScreen, mode: FlowMode = "start"): FlowScreen | null {
  const list = screensFor(mode);
  const index = list.indexOf(screen);
  return index >= 0 ? list[index + 1] ?? null : null;
}

/** The screen the back arrow goes to (null on the first). Building has no back: it runs by itself. */
export function previousScreen(screen: FlowScreen, mode: FlowMode = "start"): FlowScreen | null {
  const list = screensFor(mode);
  const index = list.indexOf(screen);
  if (index <= 0) return null;
  const previous = list[index - 1]!;
  // Back from the review goes to the last question, not to the build animation.
  return previous === "building" ? list[index - 2] ?? null : previous;
}

/** Guided-build screens that have "✨ Let Rex choose for me" (the plan, categories and contact pages confirm instead). */
export const REX_CHOOSE_SCREENS: FlowScreen[] = ["products", "style", "colours", "banner", "words", "layout", "sections", "media", "about"];

// ─── What's saved (Store.brandSettings.onboardingMemory.rexBuild) ────────────

export type StyleId = "warm" | "soft" | "luxury" | "bold";
export type LayoutChoice = "grid" | "big" | "slider";
export type ShowFirst = "best-sellers" | "new" | "collection";
export type ExtraSection = "reviews" | "delivery" | "whatsapp" | "countdown" | "instagram";
export type DeliveryDays = "1" | "2" | "2-3" | "3-5";
export type BannerSource = "product" | "rex_library" | "upload";

export interface DeliveryAreaChoice {
  state: string;
  days: DeliveryDays;
  fee: number;
}

export interface StepRecord {
  usedRexChoose: boolean;
  seconds: number;
  at: string;
}

export interface RexBuildMemory {
  mode?: FlowMode;
  screen?: FlowScreen;
  startedAt?: string;
  /** Rex's guided build started (D0 "Let's go"). */
  buildStartedAt?: string;
  updatedAt?: string;
  lastActivityAt?: string;
  firstName?: string;
  categories?: string[];
  slugEdited?: boolean;
  path?: "rex" | "self";
  /** The library theme the draft was put on (by category), so it's applied once. */
  themeId?: string;
  style?: StyleId;
  palette?: string;
  banner?: { url: string; source: BannerSource; assetId?: string | null; swipes?: number } | null;
  words?: { headline: string; sub?: string; cta?: string; options?: Array<{ headline: string; sub?: string; cta?: string }> } | null;
  layout?: { layout: LayoutChoice; show: ShowFirst; collectionId?: string | null; showPrice: boolean } | null;
  sections?: Partial<Record<ExtraSection, boolean>> | null;
  media?: string[];
  about?: { started?: string; different?: string; story?: string; images?: string[] } | null;
  contact?: { whatsapp?: string; areas?: DeliveryAreaChoice[]; pickup?: string; pod?: boolean } | null;
  categoriesConfirmed?: boolean;
  steps?: Partial<Record<FlowScreen, StepRecord>>;
  builtAt?: string | null;
  builtPages?: number;
  /** The seller left the building screen: Peggy pushes "Your shop is ready" when it's done. */
  notifyWhenBuilt?: boolean;
  liveAt?: string | null;
  /** Where they came from (website, ad, referral, pilot invite) and what they meant to do. */
  source?: string;
  intent?: { kind: "add_product" | "dropship"; productSlug: string; addedProductId?: string | null } | null;
  referralCode?: string | null;
  pilotInvite?: string | null;
  /** Peggy's WhatsApp nudges sent while the shop isn't live (ISO times; two at most). */
  nudges?: string[];
}

const NESTED: Array<keyof RexBuildMemory> = ["words", "layout", "sections", "about", "contact", "steps", "intent"];

/** Saved answers with a step's answers on top. Small objects merge one level deep; lists are replaced. */
export function mergeRexBuild(current: RexBuildMemory | null | undefined, patch: Partial<RexBuildMemory>, now = new Date()): RexBuildMemory {
  const base: RexBuildMemory = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch) as Array<[keyof RexBuildMemory, unknown]>) {
    if (value === undefined) continue;
    if (NESTED.includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const before = base[key];
      (base as Record<string, unknown>)[key] = { ...(before && typeof before === "object" ? (before as object) : {}), ...(value as object) };
    } else {
      (base as Record<string, unknown>)[key] = value;
    }
  }
  base.updatedAt = now.toISOString();
  return base;
}

/** The saved memory from brandSettings.onboardingMemory.rexBuild (anything else reads as nothing). */
export function readRexBuild(brandSettings: unknown): RexBuildMemory {
  const settings = record(brandSettings);
  const memory = record(settings.onboardingMemory);
  const saved = record(memory.rexBuild);
  return saved as RexBuildMemory;
}

/**
 * Where a returning seller picks up. Live: nowhere (onboarding is done). Built but not live: the review. Mid-build:
 * the saved screen (the building screen picks its job back up). Nothing saved: the start.
 */
export function resumeScreen(flow: RexBuildMemory | null | undefined, live: boolean): FlowScreen | null {
  if (live || flow?.liveAt) return flow?.mode === "redesign" && flow.screen && flow.screen !== "live" ? flow.screen : null;
  if (flow?.builtAt && (!flow.screen || stepOf(flow.screen) === 5)) return "review";
  if (flow?.screen && isFlowScreen(flow.screen) && flow.screen !== "live") return flow.screen;
  return "intro";
}

/** "Welcome back, Ada. Let's finish your shop: Step 3 of 5." on reopening part-way (null on the very start). */
export function welcomeBack(flow: RexBuildMemory | null | undefined, screen: FlowScreen | null): { name: string; step: number | null } | null {
  if (!flow?.screen || !screen || screen === "intro") return null;
  return { name: (flow.firstName ?? "").trim(), step: stepOf(screen) };
}

/** Steps left before the shop is live ("Your shop is 3 steps away"): the build steps not started yet, at least one. */
export function stepsLeft(screen: FlowScreen | null | undefined): number {
  const step = screen ? stepOf(screen) : null;
  if (!step) return BUILD_STEPS.length;
  return Math.max(1, BUILD_STEPS.length - step + 1);
}

// ─── B2 / B4: name and the free link ────────────────────────────────────────

export const FIRST_NAME_MAX = 40;
export const SHOP_NAME_MIN = 2;
export const SHOP_NAME_MAX = 40;
/** The free link's own rules (shared/store-address.ts): at least 3, at most 40 letters and numbers. */
export const LINK_MIN = 3;
export const LINK_MAX = 40;

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

/** "  ada  " → "Ada": a first name as Rex says it ("Hi Ada!"). */
export function cleanFirstName(value: string) {
  const word = value.replace(EMOJI, "").trim().split(/\s+/)[0] ?? "";
  return word.slice(0, FIRST_NAME_MAX).replace(/^\p{Ll}/u, (letter) => letter.toUpperCase());
}

export function cleanShopName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/** Why a shop name can't be used ("short": under 2 characters, "long": over 40), or null. */
export function shopNameProblem(value: string): "short" | "long" | null {
  const length = [...cleanShopName(value)].length;
  if (length < SHOP_NAME_MIN) return "short";
  if (length > SHOP_NAME_MAX) return "long";
  return null;
}

/** The free link from the shop name: lowercase letters and numbers only, emojis and accents dropped ("Ada's Hair ✨" → "adashair"). */
export function linkSlug(name: string) {
  return name
    .replace(EMOJI, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, LINK_MAX);
}

/** A link the seller typed, kept to the link's characters (letters, numbers, and the hyphen a suggestion may carry). */
export function cleanLinkInput(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").replace(/^-+/, "").slice(0, LINK_MAX);
}

/** Why a link can't be used before asking the server ("short", "numbers"), or null. */
export function linkProblem(slug: string): "short" | "numbers" | null {
  const clean = slug.replace(/-+$/g, "");
  if (clean.length < LINK_MIN) return "short";
  if (/^\d+$/.test(clean)) return "numbers";
  return null;
}

/** When the link is taken: the city added ("adashair-enugu"), then a number ("adashair2"), then "shop". */
export function linkSuggestions(slug: string, city?: string | null, taken: readonly string[] = []): string[] {
  const base = slug.replace(/-+$/g, "").slice(0, LINK_MAX - 6);
  if (!base) return [];
  const place = linkSlug(city ?? "");
  const ideas = [place ? `${base}-${place}` : "", `${base}2`, `${base}ng`, `shop${base}`, `${base}3`];
  return [...new Set(ideas.filter((idea) => idea && idea !== slug && idea.length <= LINK_MAX && !taken.includes(idea)))].slice(0, 3);
}

// ─── B3: what they sell ──────────────────────────────────────────────────────

export const SELL_CHIPS = ["hair_beauty", "fashion", "food", "gadgets", "home", "jewellery", "baby_kids", "health", "other"] as const;
export type SellChip = (typeof SELL_CHIPS)[number];

/** The library theme Rex starts a shop on for what it sells (basic-tier themes, open on every plan). */
const THEME_FOR: Record<SellChip, string> = {
  hair_beauty: "ewa",
  fashion: "breeze",
  food: "pantry",
  gadgets: "plug",
  home: "ile",
  jewellery: "breeze",
  baby_kids: "plain",
  health: "plain",
  other: "plain",
};

export function themeFor(categories: readonly string[] | null | undefined): string {
  const first = (categories ?? []).find((key): key is SellChip => (SELL_CHIPS as readonly string[]).includes(key));
  return first ? THEME_FOR[first] : "plain";
}

// ─── D1b: categories and the price check ─────────────────────────────────────

/** Words in a product's name that say which category it belongs in (the shop can rename every one). */
const GROUP_WORDS: Array<[string, RegExp]> = [
  ["Wigs", /\b(wigs?|lace ?front|frontals?|closures?|bob)\b/i],
  ["Braids and extensions", /\b(braids?|extensions?|weaves?|bundles?|attachments?|crochet|locs?)\b/i],
  ["Hair care", /\b(oils?|lotions?|shampoos?|conditioners?|serums?|scalp|hair ?cream|butter|gel|edge)\b/i],
  ["Skincare", /\b(soaps?|skin|face|toners?|sunscreen|cleansers?|moisturi[sz]er|body ?cream)\b/i],
  ["Makeup", /\b(lipsticks?|lip ?gloss|foundation|powder|mascara|eyeliner|lashes|brows?|makeup)\b/i],
  ["Perfume", /\b(perfumes?|fragrance|cologne|oud|body ?mist|scent)\b/i],
  ["Fabrics", /\b(ankara|lace|aso ?oke|fabrics?|george|adire|kente|yards?)\b/i],
  ["Dresses", /\b(dress(es)?|gowns?|kaftans?|abayas?|bubu)\b/i],
  ["Tops", /\b(shirts?|tops?|blouses?|tees?|t-shirts?|polos?|jackets?|blazers?|hoodies?)\b/i],
  ["Trousers and skirts", /\b(trousers?|jeans?|pants|skirts?|shorts|joggers)\b/i],
  ["Shoes", /\b(shoes?|sneakers?|sandals?|slippers?|heels?|boots?|loafers?)\b/i],
  ["Bags", /\b(bags?|purses?|totes?|clutch(es)?|backpacks?|wallets?)\b/i],
  ["Jewellery", /\b(necklaces?|bracelets?|rings?|earrings?|beads?|chains?|anklets?|watch(es)?)\b/i],
  ["Phones and accessories", /\b(phones?|iphone|samsung|chargers?|cables?|earbuds?|airpods?|headphones?|power ?banks?|phone ?case)\b/i],
  ["Snacks", /\b(chin ?chin|snacks?|cookies?|cakes?|puff ?puff|plantain ?chips|biscuits?|meat ?pies?)\b/i],
  ["Drinks", /\b(drinks?|juices?|zobo|kunu|smoothies?|tea|coffee|wines?)\b/i],
  ["Meals", /\b(rice|soups?|stews?|jollof|swallow|suya|meals?|food ?trays?)\b/i],
  ["Kitchen", /\b(pots?|pans?|plates?|cups?|spoons?|kitchen|blenders?|knives|knife)\b/i],
  ["Home decor", /\b(candles?|cushions?|pillows?|vases?|frames?|rugs?|curtains?|decor|duvets?|bedsheets?)\b/i],
  ["Baby and kids", /\b(baby|diapers?|nappies|toddlers?|kids?|children)\b/i],
];

export interface GroupableProduct {
  id: string;
  name: string;
  price?: number | null;
}

/**
 * Rex's first sort (D1b) from the product names: up to four categories, biggest first; what fits nowhere goes in
 * `otherName`. Never empty while there are products. The seller renames, adds or confirms before it's saved.
 */
export function groupProducts(products: readonly GroupableProduct[], otherName: string): Array<{ name: string; productIds: string[] }> {
  const groups = new Map<string, string[]>();
  const rest: string[] = [];
  for (const product of products) {
    const found = GROUP_WORDS.find(([, words]) => words.test(product.name));
    if (!found) {
      rest.push(product.id);
      continue;
    }
    groups.set(found[0], [...(groups.get(found[0]) ?? []), product.id]);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, productIds]) => ({ name, productIds }));
  const kept = sorted.slice(0, 3);
  const spill = sorted.slice(3).flatMap((group) => group.productIds);
  const others = [...spill, ...rest];
  if (others.length) kept.push({ name: otherName, productIds: others });
  return kept;
}

/** Products whose price looks off (D1b "flags prices that look off"): none at all, or far from the shop's others. */
export function pricesToCheck(products: readonly GroupableProduct[]): string[] {
  const priced = products.map((product) => Number(product.price ?? 0)).filter((price) => price > 0).sort((a, b) => a - b);
  const median = priced.length ? priced[Math.floor(priced.length / 2)]! : 0;
  return products
    .filter((product) => {
      const price = Number(product.price ?? 0);
      if (!(price > 0)) return true;
      return priced.length >= 3 && (price > median * 15 || price < median / 15);
    })
    .map((product) => product.id);
}

// ─── D2: style and colours ───────────────────────────────────────────────────

export interface StyleDef {
  id: StyleId;
  /** The colour set Rex leads with for this style (PALETTES). */
  palettes: [string, string, string];
  font: (typeof FONT_CHOICES)[number]["id"];
  buttons: (typeof BUTTON_CHOICES)[number]["id"];
  /** The banner words' feel (shared/store-banner.ts BANNER_VIBES). */
  vibe: "bold" | "soft" | "luxury" | "festive";
}

export const STYLES: StyleDef[] = [
  { id: "warm", palettes: ["warm", "clay", "teal"], font: "bold", buttons: "round", vibe: "bold" },
  { id: "soft", palettes: ["teal", "sage", "rose"], font: "clean", buttons: "soft", vibe: "soft" },
  { id: "luxury", palettes: ["noir", "gold", "plum"], font: "elegant", buttons: "square", vibe: "luxury" },
  { id: "bold", palettes: ["rose", "warm", "indigo"], font: "bold", buttons: "round", vibe: "festive" },
];

export interface PaletteDef {
  id: string;
  /** Four dots on the card: main, light, paper, ink. */
  swatch: [string, string, string, string];
  tokens: Record<string, string>;
}

const preset = (id: "warm" | "teal" | "noir" | "rose") => THEME_PRESETS.find((entry) => entry.id === id)!.tokens;

export const PALETTES: PaletteDef[] = [
  { id: "warm", swatch: ["#FF6A2B", "#FFF3EC", "#FFFFFF", "#16141F"], tokens: preset("warm") },
  { id: "teal", swatch: ["#0C4A44", "#E2F6F1", "#F3FAF8", "#0C2E2A"], tokens: preset("teal") },
  { id: "noir", swatch: ["#E2F5A0", "#26222F", "#16141F", "#F5F4F8"], tokens: preset("noir") },
  { id: "rose", swatch: ["#C2185B", "#FCE4EC", "#FFF7F9", "#2A1420"], tokens: preset("rose") },
  {
    id: "clay",
    swatch: ["#C9744A", "#F3EDE6", "#FFFBF7", "#2A2018"],
    tokens: { accent: "#C9744A", ctaBg: "#C9744A", ctaText: "#FFFFFF", paperBg: "#FFFBF7", cardBg: "#F3EDE6", ink: "#2A2018", muted: "#6E5E52", border: "#EADFD4", heroBg: "#F3EDE6", heroText: "#2A2018" },
  },
  {
    id: "sage",
    swatch: ["#4F7A5A", "#E8EFEA", "#F7FAF7", "#15322A"],
    tokens: { accent: "#4F7A5A", ctaBg: "#4F7A5A", ctaText: "#FFFFFF", paperBg: "#F7FAF7", cardBg: "#E8EFEA", ink: "#15322A", muted: "#56695E", border: "#D6E2D9", heroBg: "#E8EFEA", heroText: "#15322A" },
  },
  {
    id: "gold",
    swatch: ["#C8A24A", "#2A2418", "#15120C", "#F6F0E1"],
    tokens: { accent: "#C8A24A", ctaBg: "#C8A24A", ctaText: "#15120C", paperBg: "#15120C", cardBg: "#2A2418", ink: "#F6F0E1", muted: "#BDB29A", border: "#3A3222", heroBg: "#2A2418", heroText: "#F6F0E1" },
  },
  {
    id: "plum",
    swatch: ["#6B4F8A", "#EFE9F5", "#FBF9FD", "#22182E"],
    tokens: { accent: "#6B4F8A", ctaBg: "#6B4F8A", ctaText: "#FFFFFF", paperBg: "#FBF9FD", cardBg: "#EFE9F5", ink: "#22182E", muted: "#6D6279", border: "#E0D7EA", heroBg: "#EFE9F5", heroText: "#22182E" },
  },
  {
    id: "indigo",
    swatch: ["#1F2A63", "#F2A71B", "#F3F3F7", "#11163A"],
    tokens: { accent: "#F2A71B", ctaBg: "#1F2A63", ctaText: "#FFFFFF", paperBg: "#F3F3F7", cardBg: "#E6E8F3", ink: "#11163A", muted: "#5B5F7A", border: "#DADDEB", heroBg: "#1F2A63", heroText: "#FFFFFF" },
  },
];

export function styleDef(id: StyleId | null | undefined): StyleDef {
  return STYLES.find((style) => style.id === id) ?? STYLES[0]!;
}

export function paletteDef(id: string | null | undefined): PaletteDef | null {
  return PALETTES.find((palette) => palette.id === id) ?? null;
}

/** The three colour sets shown for a style (D2b), Rex's first. */
export function palettesFor(style: StyleId | null | undefined): PaletteDef[] {
  return styleDef(style).palettes.map((id) => paletteDef(id)!).filter(Boolean);
}

const STYLE_FOR: Record<SellChip, StyleId> = {
  hair_beauty: "warm",
  fashion: "bold",
  food: "warm",
  gadgets: "soft",
  home: "soft",
  jewellery: "luxury",
  baby_kids: "bold",
  health: "soft",
  other: "warm",
};

/** Rex's style for what the shop sells (the "✨ Rex pick" tag on D2a). */
export function recommendStyle(categories: readonly string[] | null | undefined): StyleId {
  const first = (categories ?? []).find((key): key is SellChip => (SELL_CHIPS as readonly string[]).includes(key));
  return first ? STYLE_FOR[first] : "warm";
}

/** "Brighter colours" on the review (E2): the style's set with the most colour on its buttons, else the next set. */
export function brighterPalette(current: string | null | undefined, style: StyleId | null | undefined): PaletteDef {
  const sets = palettesFor(style);
  const order = ["rose", "warm", "indigo", "clay", "plum", "teal", "sage", "gold", "noir"];
  const sorted = [...PALETTES].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const next = sorted.find((palette) => palette.id !== current && sets.some((set) => set.id === palette.id)) ?? sorted.find((palette) => palette.id !== current);
  return next ?? PALETTES[0]!;
}

/** The theme tokens for a style and colour set: colours, fonts and button shape. */
export function styleTokens(style: StyleId | null | undefined, palette: string | null | undefined): Record<string, string> {
  const def = styleDef(style);
  const colours = paletteDef(palette)?.tokens ?? paletteDef(def.palettes[0])!.tokens;
  const font = FONT_CHOICES.find((choice) => choice.id === def.font)?.tokens ?? {};
  const buttons = BUTTON_CHOICES.find((choice) => choice.id === def.buttons)?.tokens ?? {};
  return { ...colours, ...font, ...buttons };
}

// ─── D3: home page ───────────────────────────────────────────────────────────

/** Photos Rex offers for the banner (D3a): the seller's own product photos first, then Rex's library, ~5 in all. */
export function bannerCandidates(productPhotos: readonly string[], library: readonly string[], max = 5): Array<{ url: string; source: BannerSource }> {
  const out: Array<{ url: string; source: BannerSource }> = [];
  for (const url of productPhotos) if (url && !out.some((item) => item.url === url)) out.push({ url, source: "product" });
  for (const url of library) if (url && !out.some((item) => item.url === url)) out.push({ url, source: "rex_library" });
  // Two of the seller's own at most, so the swipe also shows banner-shaped pictures.
  const own = out.filter((item) => item.source === "product").slice(0, 2);
  const rest = out.filter((item) => item.source !== "product");
  return [...own, ...rest].slice(0, max);
}

export const LAYOUTS: LayoutChoice[] = ["grid", "big", "slider"];

/** The store editor's products layout for each choice (shared/store-editor.ts PRODUCT_LAYOUTS). */
export const LAYOUT_TO_EDITOR: Record<LayoutChoice, ProductsLayout> = { grid: "two", big: "one", slider: "slider" };

/** Rex's layout from how many products there are: a grid for many, big cards for one or two, a slider between. */
export function recommendLayout(productCount: number): LayoutChoice {
  if (productCount >= 4) return "grid";
  if (productCount <= 2) return "big";
  return "slider";
}

export const EXTRA_SECTIONS: ExtraSection[] = ["reviews", "delivery", "whatsapp", "countdown", "instagram"];

/** The ones Rex switches on (marked "Rex" on D3d): what helps most shops sell. */
export const REX_SECTIONS: ExtraSection[] = ["reviews", "delivery", "whatsapp"];

export function defaultSections(): Record<ExtraSection, boolean> {
  return Object.fromEntries(EXTRA_SECTIONS.map((key) => [key, REX_SECTIONS.includes(key)])) as Record<ExtraSection, boolean>;
}

// ─── D4: pages ───────────────────────────────────────────────────────────────

/**
 * Rex's photo library is shared/rex-photo-library.ts (Unsplash photos kept in Shopinbos's own storage, each with its
 * photographer's credit). D4a's tabs: the seller's own categories first, then people, backgrounds and markets, then
 * "mine" (their own product photos).
 */
export const LIBRARY_SHOP_CATEGORIES = ["hair_beauty", "fashion", "food", "gadgets", "home"] as const;
export type LibraryCategory = string;

export function libraryTabs(categories: readonly string[] | null | undefined): string[] {
  return [...rexLibraryCategoriesFor(categories ?? []), "mine"];
}

/** Rex's library photos for the shop (its own categories first), with the seller's own product photos as "mine". */
export function libraryPhotos(categories: readonly string[] | null | undefined, productImages: readonly string[] = []): LibraryPhoto[] {
  const photos: LibraryPhoto[] = rexLibraryFor(categories ?? []).map((photo) => ({
    id: photo.id,
    url: photo.url,
    thumb: photo.thumbUrl,
    category: photo.category,
    alt: photo.alt,
    credit: photo.credit,
    licence: photo.licence,
  }));
  for (const [index, url] of productImages.slice(0, 24).entries()) photos.push({ id: `mine-${index}`, url, thumb: url, category: "mine", licence: "own" });
  return photos;
}

export interface LibraryPhoto {
  id: string;
  url: string;
  thumb: string;
  category: LibraryCategory;
  alt?: string;
  /** The photographer (Unsplash): "Photo: Name / Unsplash" under About page pictures. */
  credit?: { name: string; profileUrl: string } | null;
  /** Where it's from: "Unsplash License", or the seller's own photo. */
  licence: string;
}

/** The About story when Rex can't write one: the seller's own two answers, tidied. */
export function plainAboutStory(shopName: string, started: string, different: string) {
  const when = started.trim().replace(/[.!]+$/, "");
  const why = different.trim().replace(/[.!]+$/, "");
  const parts = [when ? `${shopName} started ${when.replace(/^(in|since)\s+/i, "in ")}.` : `${shopName} is a small business that cares.`];
  if (why) parts.push(`${why.charAt(0).toUpperCase()}${why.slice(1)}.`);
  return parts.join(" ");
}

export const DAYS_CHOICES: DeliveryDays[] = ["1", "2", "2-3", "3-5"];

/** The next delivery time when a chip is tapped (1 day → 2 days → 2–3 days → 3–5 days → 1 day). */
export function nextDays(days: DeliveryDays): DeliveryDays {
  return DAYS_CHOICES[(DAYS_CHOICES.indexOf(days) + 1) % DAYS_CHOICES.length]!;
}

/** Rex's starting delivery areas (D4c): the shop's own state in a day, Lagos and Abuja further out. */
export function defaultAreas(homeState: string | null | undefined): DeliveryAreaChoice[] {
  const home = (homeState ?? "").trim() || "Lagos";
  const areas: DeliveryAreaChoice[] = [{ state: home, days: "1", fee: 2000 }];
  if (home.toLowerCase() !== "lagos") areas.push({ state: "Lagos", days: "2", fee: 3500 });
  if (!/abuja|fct/i.test(home)) areas.push({ state: "Abuja", days: "2-3", fee: 3500 });
  return areas;
}

/** A WhatsApp number that can take messages: 10 to 15 digits (with or without the +234). */
export function validWhatsapp(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

// ─── "Let Rex choose for me" ─────────────────────────────────────────────────

export interface RexChoiceContext {
  categories: string[];
  productCount: number;
  style?: StyleId | null;
  bannerOptions: Array<{ url: string; source: BannerSource }>;
  wordOptions: Array<{ headline: string; sub?: string; cta?: string }>;
  libraryIds: string[];
}

export type RexChoice =
  | { screen: "products"; label: "later" }
  | { screen: "style"; style: StyleId }
  | { screen: "colours"; palette: string }
  | { screen: "banner"; banner: { url: string; source: BannerSource } | null }
  | { screen: "words"; words: { headline: string; sub?: string; cta?: string } | null }
  | { screen: "layout"; layout: { layout: LayoutChoice; show: ShowFirst; showPrice: boolean } }
  | { screen: "sections"; sections: Record<ExtraSection, boolean> }
  | { screen: "media"; media: string[] }
  | { screen: "about"; label: "write" };

/** What Rex picks on a screen (the same as its recommendation shown there), or null where there's nothing to pick. */
export function rexChoice(screen: FlowScreen, context: RexChoiceContext): RexChoice | null {
  switch (screen) {
    case "products":
      return { screen, label: "later" };
    case "style":
      return { screen, style: recommendStyle(context.categories) };
    case "colours":
      return { screen, palette: palettesFor(context.style ?? recommendStyle(context.categories))[0]!.id };
    case "banner":
      return { screen, banner: context.bannerOptions[0] ?? null };
    case "words":
      return { screen, words: context.wordOptions[0] ?? null };
    case "layout":
      return { screen, layout: { layout: recommendLayout(context.productCount), show: "best-sellers", showPrice: true } };
    case "sections":
      return { screen, sections: defaultSections() };
    case "media":
      return { screen, media: context.libraryIds.slice(0, 2) };
    case "about":
      return { screen, label: "write" };
    default:
      return null;
  }
}

/** How long "✓ Rex chose: …" shows before the next screen. */
export const REX_CHOSE_FLASH_MS = 1000;

// ─── E: build, review, go live ───────────────────────────────────────────────

/** The checklist on "Watch the magic" (E1), ticked in this order. */
export const BUILD_TICKS = ["colours", "banner", "products", "about", "contact", "checkout"] as const;
export type BuildTick = (typeof BUILD_TICKS)[number];

/** Target time for the build screen; the bar never claims more than it knows. */
export const BUILD_TARGET_SECONDS = 45;

/** The bar on E1: time-based up to 90% while the job runs, 100% once it's done. */
export function buildProgress(elapsedMs: number, done: boolean): { percent: number; secondsLeft: number; ticked: number } {
  if (done) return { percent: 100, secondsLeft: 0, ticked: BUILD_TICKS.length };
  const fraction = Math.min(0.9, elapsedMs / (BUILD_TARGET_SECONDS * 1000));
  const percent = Math.round(fraction * 100);
  return { percent, secondsLeft: Math.max(1, Math.round(BUILD_TARGET_SECONDS - elapsedMs / 1000)), ticked: Math.min(BUILD_TICKS.length - 1, Math.floor(fraction * BUILD_TICKS.length)) };
}

export type GoLiveBlocker = "product" | "name" | "whatsapp";

/** What stops a shop going live (friendly blockers on E2): a priced product, a name and link, a WhatsApp number. */
export function goLiveBlockers(facts: { pricedProducts: number; name: string | null | undefined; slug: string | null | undefined; whatsapp: string | null | undefined }): GoLiveBlocker[] {
  const out: GoLiveBlocker[] = [];
  if (facts.pricedProducts < 1) out.push("product");
  if (!cleanShopName(facts.name ?? "") || !(facts.slug ?? "").trim()) out.push("name");
  if (!validWhatsapp(facts.whatsapp)) out.push("whatsapp");
  return out;
}

/** "Change the words" on the review: the next of Rex's lines after the one showing. */
export function nextWords<T extends { headline: string }>(options: readonly T[], current: string | null | undefined): T | null {
  if (!options.length) return null;
  const index = options.findIndex((option) => option.headline === current);
  return options[(index + 1) % options.length] ?? null;
}

/** "Different banner photo" on the review: the next photo after the one showing. */
export function nextBanner<T extends { url: string }>(options: readonly T[], current: string | null | undefined): T | null {
  if (!options.length) return null;
  const index = options.findIndex((option) => option.url === current);
  return options[(index + 1) % options.length] ?? null;
}

// ─── Building the draft ──────────────────────────────────────────────────────

const BANNER_KINDS = ["hero-split", "split-hero", "parallax-banner", "promo-banner", "page-header", "video-hero"];
const STORY_KINDS = ["story-split", "about-section", "founder-story"];

/** Which existing section a toggle stands for (shared/store-editor.ts EDITOR_BLOCKS kinds, both renderers). */
const SECTION_KINDS: Record<ExtraSection, string[]> = {
  reviews: ["testimonials", "review-carousel"],
  delivery: ["trust-badges", "delivery-info", "trust-strip"],
  whatsapp: ["contact-form"],
  countdown: ["payday-countdown", "promo-banner", "campaign-countdown-hero"],
  instagram: ["ugc-grid"],
};

export interface RexBuildInput {
  flow: RexBuildMemory;
  storeName: string;
  renderer: Renderer;
  /** The editor's ready-made sections by block id (src/lib/store-editor/mobile.server.ts editorCatalog). */
  catalog: Record<string, EdSection>;
  /** New section ids (the server passes a counter so tests are stable). */
  newId: (kind: string) => string;
}

/**
 * Rex's guided build applied to the draft: colours, fonts and buttons; the banner's photo and words; the products
 * section's layout, what shows first and prices; the extra sections switched on or off; the About story and photos.
 * Pure: the same answers always give the same draft. Returns what it did, for the build screen's checklist.
 */
export function applyRexBuild(snapshot: EdSnapshot, input: RexBuildInput): { snapshot: EdSnapshot; done: BuildTick[]; pages: number } {
  const { flow, renderer, catalog } = input;
  const done: BuildTick[] = [];
  let next = snapshot;

  if (flow.style || flow.palette) {
    next = applyTokens(next, styleTokens(flow.style, flow.palette));
    done.push("colours");
  }

  const home = findPage(next, "home");
  if (home) {
    const banner = home.sections.find((section) => BANNER_KINDS.includes(section.kind) && section.visible !== false) ?? home.sections.find((section) => BANNER_KINDS.includes(section.kind));
    if (banner) {
      if (flow.banner?.url) next = setPhoto(next, "home", banner.id, flow.banner.url);
      if (flow.words?.headline) next = setCopy(next, "home", banner.id, "title", flow.words.headline);
      if (flow.words?.sub) next = setCopy(next, "home", banner.id, "body", flow.words.sub);
      if (flow.words?.cta) next = setCopy(next, "home", banner.id, "primaryCta", flow.words.cta);
      if (flow.banner?.url || flow.words?.headline) done.push("banner");
    }

    const products = findPage(next, "home")!.sections.find((section) => isProductsKind(section.kind));
    if (products && flow.layout) {
      next = setProductsLayout(next, "home", products.id, LAYOUT_TO_EDITOR[flow.layout.layout], renderer);
      const show = flow.layout.show === "collection" && flow.layout.collectionId ? { kind: "collection" as const, collectionId: flow.layout.collectionId } : flow.layout.show === "new" ? { kind: "new" as const } : { kind: "best-sellers" as const };
      next = setProductsShow(next, "home", products.id, show, renderer);
      next = setSetting(next, "home", products.id, { showPrice: flow.layout.showPrice });
    }
    if (products || flow.layout) done.push("products");

    // Extra sections: switch on the ones there, add the missing ones (after the products), hide the ones turned off.
    const wanted = flow.sections ?? {};
    let after = products?.id ?? banner?.id ?? null;
    for (const key of EXTRA_SECTIONS) {
      const on = wanted[key];
      if (on === undefined) continue;
      const sections = findPage(next, "home")!.sections;
      const existing = sections.find((section) => SECTION_KINDS[key].includes(section.kind));
      if (existing) {
        if (existing.visible !== on) next = toggleSection(next, "home", existing.id, on);
        if (on) after = existing.id;
      } else if (on && catalog[key]) {
        const id = input.newId(catalog[key]!.kind);
        next = insertSection(next, "home", withNewIds(catalog[key]!, id), after);
        after = id;
      }
    }
  }

  // The About page: Rex's story and the photos picked from the library.
  if (flow.about?.story) {
    let about = findPage(next, "about");
    if (!about && catalog.photoText) {
      const added = addPage(next, "About us", withNewIds(catalog.photoText, input.newId(catalog.photoText.kind)), input.storeName);
      next = added.snapshot;
      about = findPage(next, added.key);
    }
    if (about) {
      const key = about.pageType;
      const story = about.sections.find((section) => STORY_KINDS.includes(section.kind)) ?? about.sections.find((section) => section.kind === "text-columns" || section.kind === "text" || section.kind === "page-header");
      if (story) {
        next = setCopy(next, key, story.id, "body", flow.about.story);
        const photo = flow.about.images?.[0] ?? flow.media?.[0];
        if (photo) next = setPhoto(next, key, story.id, photo);
      }
      done.push("about");
    }
  }

  // Contact and checkout read the shop's own settings (WhatsApp, delivery areas, pay on delivery): nothing to write.
  if (flow.contact) done.push("contact");
  done.push("checkout");

  return { snapshot: next, done, pages: pageRows(next).length };
}

// ─── F: Home "Get your shop ready" ───────────────────────────────────────────

export const SHOP_READY_ITEMS = ["bank", "delivery", "pod", "share", "post", "products", "channels", "domain"] as const;
export type ShopReadyItem = (typeof SHOP_READY_ITEMS)[number];

export interface ShopReadyFacts {
  payoutBank: boolean;
  deliveryPartners: number;
  /** "I deliver myself" was picked in the delivery hub. */
  deliversSelf: boolean;
  podOn: boolean;
  shared: boolean;
  posts: number;
  products: number;
  socialsConnected: number;
  customDomain: boolean;
}

/** Shops with more products look trusted: "Add 3 more products" shows while there are fewer than this. */
export const TRUSTED_PRODUCT_COUNT = 4;

export interface ShopReadyRow {
  key: ShopReadyItem;
  done: boolean;
  optional: boolean;
}

/**
 * The "Get your shop ready" list, in the spec's order. Each item disappears when done (`open`); the bar counts the
 * required ones. "Add more products" only applies while the shop has fewer than four; the domain is optional.
 */
export function shopReadyChecklist(facts: ShopReadyFacts) {
  const rows: ShopReadyRow[] = [
    { key: "bank", done: facts.payoutBank, optional: false },
    { key: "delivery", done: facts.deliveryPartners > 0 || facts.deliversSelf, optional: false },
    { key: "pod", done: facts.podOn, optional: false },
    { key: "share", done: facts.shared, optional: false },
    { key: "post", done: facts.posts > 0, optional: false },
    { key: "products", done: facts.products >= TRUSTED_PRODUCT_COUNT, optional: false },
    { key: "channels", done: facts.socialsConnected > 0, optional: false },
    { key: "domain", done: facts.customDomain, optional: true },
  ];
  const required = rows.filter((row) => !row.optional);
  const done = required.filter((row) => row.done).length;
  return {
    rows,
    open: rows.filter((row) => !row.done),
    done,
    total: required.length,
    percent: Math.round((done / required.length) * 100),
    complete: done === required.length,
  };
}

/** How many more products "Add 3 more products" asks for (at least one). */
export function moreProductsWanted(products: number) {
  return Math.max(1, TRUSTED_PRODUCT_COUNT - products);
}

// ─── Analytics (spec §7) ─────────────────────────────────────────────────────

export const ONBOARDING_EVENTS = [
  "onboarding_started",
  "otp_sent",
  "otp_verified",
  "role_selected",
  "shop_basics_done",
  "build_path_chosen",
  "rex_step_completed",
  "banner_photo_choice",
  "build_started",
  "build_finished",
  "review_change_requested",
  "shop_went_live",
  "share_tapped",
  "checklist_item_done",
  "first_order",
  "onboarding_abandoned",
] as const;
export type OnboardingEvent = (typeof ONBOARDING_EVENTS)[number];

export function isOnboardingEvent(value: unknown): value is OnboardingEvent {
  return typeof value === "string" && (ONBOARDING_EVENTS as readonly string[]).includes(value);
}

/** Event properties kept to short strings, numbers and booleans (nothing else goes to the analytics tools). */
export function cleanEventProps(props: unknown): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(record(props)).slice(0, 12)) {
    if (!/^[a-zA-Z][\w]{0,39}$/.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean" || value === null) out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, 120);
    else if (Array.isArray(value)) out[key] = value.filter((item) => typeof item === "string").join(",").slice(0, 120);
  }
  return out;
}

// ─── Re-engagement (spec §7) ─────────────────────────────────────────────────

export const NUDGE_AFTER_MS = 24 * 60 * 60 * 1000;
export const NUDGES_MAX = 2;

/**
 * Whether Peggy's WhatsApp nudge ("Your shop is 3 steps away. Tap to finish.") is due: the shop isn't live, nothing
 * happened for 24 hours, fewer than two were sent, and none in the last 24 hours.
 */
export function dueOnboardingNudge(flow: RexBuildMemory | null | undefined, live: boolean, now = Date.now()): boolean {
  if (live || flow?.liveAt || !flow?.startedAt) return false;
  const sent = flow.nudges ?? [];
  if (sent.length >= NUDGES_MAX) return false;
  const last = Date.parse(flow.lastActivityAt ?? flow.updatedAt ?? flow.startedAt);
  if (!Number.isFinite(last) || now - last < NUDGE_AFTER_MS) return false;
  const lastNudge = sent.length ? Date.parse(sent[sent.length - 1]!) : NaN;
  return !Number.isFinite(lastNudge) || now - lastNudge >= NUDGE_AFTER_MS;
}

// ─── Entry links (spec §2) ───────────────────────────────────────────────────

export interface EntryIntent {
  intent?: "add_product" | "dropship";
  productSlug?: string;
  ref?: string;
  invite?: string;
  source?: string;
}

/** What a link into the app carried: ?intent=add_product&productSlug=…, ?ref=CODE, ?invite=CODE (pilot), ?source=. */
export function entryFromQuery(query: string): EntryIntent {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const out: EntryIntent = {};
  const intent = params.get("intent");
  const slug = params.get("productSlug") ?? params.get("product");
  if ((intent === "add_product" || intent === "dropship") && slug && /^[\w-]{1,160}$/.test(slug)) {
    out.intent = intent;
    out.productSlug = slug;
  }
  const ref = params.get("ref");
  if (ref && /^[\w-]{2,40}$/.test(ref)) out.ref = ref;
  const invite = params.get("invite") ?? params.get("pilot");
  if (invite && /^[\w-]{3,40}$/.test(invite)) out.invite = invite;
  const source = params.get("source") ?? params.get("utm_source");
  if (source && /^[\w.-]{1,40}$/.test(source)) out.source = source;
  return out;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
