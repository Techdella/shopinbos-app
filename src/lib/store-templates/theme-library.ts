// The 2026 theme library: the storefront themes the seller picks from on /builder/templates and in the
// builder's Themes view. Pure data and helpers (no imports with side effects), so tests can load it directly.
//
// Display names are Nigerian (Yoruba, Hausa, Pidgin and Naija slang). Ids never change (stores keep working
// on old ids); search folds diacritics, so "afefe", "Afẹ́fẹ́" and "breeze" all find the same theme.

import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode } from "./types";

export type ThemeLibraryId =
  | "breeze" | "noir" | "plain" | "adire" | "pantry" | "ile" | "plug" | "stride"
  | "ewa" | "suku" | "asoebi" | "agbada" | "ileke" | "ounje" | "chinchin" | "oja" | "omo" | "iwe" | "owambe" | "danfo" | "turare" | "oko";

/** Category chips in the gallery (plus "any" for themes that suit every shop). */
export type ThemeLibraryCategory =
  | "fashion" | "beauty" | "food" | "home" | "gadgets" | "kids" | "books" | "events" | "auto" | "groceries" | "jewellery" | "agro" | "any";

export interface ThemeLibraryPreview {
  /** Card background, text and hairline colours (Rex's theme cards use these as swatches). */
  bg: string;
  ink: string;
  line: string;
  accent: string;
  /** How the theme name is set, in the theme's own type. */
  nameFont: "serif" | "sans" | "grotesk";
  nameWeight: number;
  nameItalic?: boolean;
  dark: boolean;
}

export interface ThemeLibraryEntry {
  id: ThemeLibraryId;
  /** Display name, with correct diacritics. */
  name: string;
  /** ASCII form of the name for URLs and search ("afefe", "aso-ebi"). */
  slug: string;
  /** One line under the name: what the word means. */
  meaning: string;
  /** Main chip. */
  category: ThemeLibraryCategory;
  /** Every chip the theme shows under (the first is `category`). */
  categories: ThemeLibraryCategory[];
  categoryLabel: string;
  /** Industries the theme is built for (search and Rex's pick). */
  industries: string[];
  blurb: string;
  isNew: boolean;
  preview: ThemeLibraryPreview;
}

type EntryInput = Omit<ThemeLibraryEntry, "slug" | "category"> & { slug?: string };

/** Lower case, accents and tone marks removed: "Ẹwà" → "ewa", "Aṣọ Ẹbí" → "aso ebi". */
export function foldText(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

export function slugifyName(value: string) {
  return foldText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function entry(input: EntryInput): ThemeLibraryEntry {
  return { ...input, name: input.name.normalize("NFC"), slug: input.slug ?? slugifyName(input.name), category: input.categories[0] ?? "any" };
}

export const THEME_LIBRARY: readonly ThemeLibraryEntry[] = [
  entry({
    id: "breeze", name: "Afẹ́fẹ́", meaning: "Yoruba for breeze", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["fashion", "clothing", "boutique", "bags"], blurb: "Airy and clean, big product pages. For fashion", isNew: false,
    preview: { bg: "#E8F6F7", ink: "#1A1D21", line: "#C9DFE1", accent: "#1FC6D6", nameFont: "grotesk", nameWeight: 400, dark: false },
  }),
  entry({
    id: "noir", name: "Dúdú", meaning: "Yoruba for black", categories: ["fashion", "jewellery"], categoryLabel: "Luxury",
    industries: ["luxury", "designer", "watches", "premium fashion"], blurb: "Dark and premium, with payday countdowns. For luxury", isNew: false,
    preview: { bg: "#141414", ink: "#F5F2EA", line: "#3A3936", accent: "#C8A96A", nameFont: "serif", nameWeight: 600, dark: true },
  }),
  entry({
    id: "plain", name: "Jẹ́jẹ́", meaning: "Yoruba for gentle, easy-going", categories: ["any"], categoryLabel: "Any shop",
    industries: ["any", "general", "minimal"], blurb: "Simple and fast. Works for anything", isNew: false,
    preview: { bg: "#F2F2F2", ink: "#111111", line: "#DADADA", accent: "#111111", nameFont: "grotesk", nameWeight: 400, dark: false },
  }),
  entry({
    id: "adire", name: "Adire", meaning: "Yoruba indigo tie-dye cloth", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["fashion", "adire", "ankara", "editorial"], blurb: "Editorial, photo-led. For fashion", isNew: false,
    preview: { bg: "#F3ECE5", ink: "#2B1D14", line: "#DDCFC1", accent: "#B8612F", nameFont: "serif", nameWeight: 400, dark: false },
  }),
  entry({
    id: "pantry", name: "Mama Put", meaning: "Naija for the neighbourhood food seller", categories: ["food"], categoryLabel: "Food and drinks",
    industries: ["food", "drinks", "zobo", "spices", "sauces", "small chops"], blurb: "Warm and bold. For food and drinks", isNew: false,
    preview: { bg: "#FFF2D8", ink: "#3A1E0B", line: "#EBD7AE", accent: "#E2541B", nameFont: "sans", nameWeight: 800, dark: false },
  }),
  entry({
    id: "ile", name: "Ilé", meaning: "Yoruba for home", categories: ["home"], categoryLabel: "Home and living",
    industries: ["home", "decor", "furniture", "homeware"], blurb: "Calm and roomy. For home and decor", isNew: false,
    preview: { bg: "#E6EDE8", ink: "#1F2A24", line: "#CBD6CE", accent: "#5E7464", nameFont: "serif", nameWeight: 700, dark: false },
  }),
  entry({
    id: "plug", name: "Plug", meaning: "Naija slang for the person who can get it for you", categories: ["gadgets"], categoryLabel: "Gadgets",
    industries: ["gadgets", "phones", "electronics", "accessories"], blurb: "Dark and sharp. For gadgets", isNew: false,
    preview: { bg: "#17181D", ink: "#F2F4F7", line: "#33363F", accent: "#5B8CFF", nameFont: "grotesk", nameWeight: 500, dark: true },
  }),
  entry({
    id: "stride", name: "Waka", meaning: "Pidgin for walk", categories: ["fashion"], categoryLabel: "Shoes",
    industries: ["shoes", "sneakers", "footwear", "sportswear"], blurb: "Loud and sporty. For shoes", isNew: false,
    preview: { bg: "#FDE6DA", ink: "#141414", line: "#F0C9B5", accent: "#FF4D1F", nameFont: "sans", nameWeight: 800, dark: false },
  }),
  entry({
    id: "ewa", name: "Ẹwà", meaning: "Yoruba for beauty", categories: ["beauty"], categoryLabel: "Beauty and skincare",
    industries: ["beauty", "skincare", "cosmetics", "makeup", "body care"], blurb: "Soft and glowing, ingredient-led. For beauty and skincare", isNew: true,
    preview: { bg: "#F9E7E1", ink: "#3B1F1A", line: "#F0D9D1", accent: "#C2566B", nameFont: "serif", nameWeight: 500, nameItalic: true, dark: false },
  }),
  entry({
    id: "suku", name: "Ṣùkú", meaning: "Yoruba crown braid style", categories: ["beauty"], categoryLabel: "Hair and wigs",
    industries: ["hair", "wigs", "braids", "hair extensions", "hair care"], blurb: "Bold and glam, made for units and lengths. For hair and wigs", isNew: true,
    preview: { bg: "#F6E7F0", ink: "#2A1630", line: "#EFDCE7", accent: "#E0679E", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "asoebi", name: "Aṣọ Ẹbí", meaning: "Yoruba for family cloth, the owambe uniform", categories: ["fashion"], categoryLabel: "Fabrics and lace",
    industries: ["fabrics", "lace", "ankara", "aso oke", "george", "gele"], blurb: "Rich and regal, fabric up close. For lace, ankara and aso-ebi", isNew: true,
    preview: { bg: "#F5EBDD", ink: "#2B1530", line: "#EADCC8", accent: "#D4A13A", nameFont: "serif", nameWeight: 600, dark: false },
  }),
  entry({
    id: "agbada", name: "Agbada", meaning: "The flowing Yoruba robe for big occasions", categories: ["fashion"], categoryLabel: "Menswear",
    industries: ["menswear", "tailoring", "native wear", "kaftan", "senator"], blurb: "Sharp and tailored. For menswear and tailors", isNew: true,
    preview: { bg: "#ECE8DF", ink: "#1A1F1C", line: "#DDD8CC", accent: "#B08D57", nameFont: "serif", nameWeight: 600, dark: false },
  }),
  entry({
    id: "ileke", name: "Ìlẹ̀kẹ̀", meaning: "Yoruba for beads", categories: ["jewellery"], categoryLabel: "Jewellery and beads",
    industries: ["jewellery", "beads", "accessories", "waist beads", "coral"], blurb: "Delicate and close-up. For jewellery and beads", isNew: true,
    preview: { bg: "#F6EBDD", ink: "#2E1B12", line: "#EADBC8", accent: "#C8462C", nameFont: "serif", nameWeight: 400, nameItalic: true, dark: false },
  }),
  entry({
    id: "ounje", name: "Oúnjẹ", meaning: "Yoruba for food", categories: ["food"], categoryLabel: "Restaurant",
    industries: ["restaurant", "food delivery", "kitchen", "catering", "buka"], blurb: "A menu, not a catalogue: order on WhatsApp up front. For restaurants", isNew: true,
    preview: { bg: "#FEF3C7", ink: "#1C1917", line: "#F1E3B8", accent: "#F59E0B", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "chinchin", name: "Chin Chin", meaning: "Naija's favourite crunchy snack", categories: ["food"], categoryLabel: "Bakery and snacks",
    industries: ["bakery", "cakes", "pastries", "snacks", "desserts"], blurb: "Sweet and playful. For cakes, pastries and snacks", isNew: true,
    preview: { bg: "#FBE7D9", ink: "#4A2511", line: "#F2DCCB", accent: "#D9467A", nameFont: "serif", nameWeight: 700, dark: false },
  }),
  entry({
    id: "oja", name: "Ọjà", meaning: "Yoruba for market", categories: ["groceries"], categoryLabel: "Groceries",
    industries: ["groceries", "supermarket", "foodstuff", "provisions", "household"], blurb: "Dense and quick, aisles first. For groceries and general stores", isNew: true,
    preview: { bg: "#F1F6F2", ink: "#14231A", line: "#E1E9E3", accent: "#0F7A3D", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "omo", name: "Ọmọ", meaning: "Yoruba for child", categories: ["kids"], categoryLabel: "Kids and baby",
    industries: ["kids", "baby", "toys", "children's clothing", "maternity"], blurb: "Bright and friendly. For kids and baby", isNew: true,
    preview: { bg: "#FFF3C4", ink: "#1F2A44", line: "#F2E2A0", accent: "#3D7BF7", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "iwe", name: "Ìwé", meaning: "Yoruba for book", categories: ["books"], categoryLabel: "Books and stationery",
    industries: ["books", "bookshop", "stationery", "school supplies"], blurb: "Quiet and literary, covers on a shelf. For books and stationery", isNew: true,
    preview: { bg: "#F1E9DA", ink: "#1E2235", line: "#E4DCCB", accent: "#B4432F", nameFont: "serif", nameWeight: 500, dark: false },
  }),
  entry({
    id: "owambe", name: "Owambe", meaning: "Naija for a big, joyful party", categories: ["events"], categoryLabel: "Events and rentals",
    industries: ["events", "party supplies", "rentals", "decor hire", "souvenirs"], blurb: "Festive and gold. For party supplies, rentals and events", isNew: true,
    preview: { bg: "#2D0B3A", ink: "#FFF4D6", line: "#4A2459", accent: "#F2B705", nameFont: "serif", nameWeight: 600, nameItalic: true, dark: true },
  }),
  entry({
    id: "danfo", name: "Danfo", meaning: "Lagos' yellow bus", categories: ["auto"], categoryLabel: "Auto parts",
    industries: ["auto parts", "car accessories", "spare parts", "tyres", "lubricants"], blurb: "Yellow, black and search-first. For auto parts", isNew: true,
    preview: { bg: "#FFC400", ink: "#111111", line: "#E0AC00", accent: "#111111", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "turare", name: "Turare", meaning: "Hausa for perfume", categories: ["beauty"], categoryLabel: "Perfume",
    industries: ["perfume", "fragrance", "oud", "body mist", "perfume oils"], blurb: "Moody and elegant, bottles on a glow. For perfume and fragrance", isNew: true,
    preview: { bg: "#1B1420", ink: "#F7EFE3", line: "#3A2E40", accent: "#C9A46A", nameFont: "serif", nameWeight: 500, dark: true },
  }),
  entry({
    id: "oko", name: "Oko", meaning: "Yoruba for farm", categories: ["agro"], categoryLabel: "Farm produce",
    industries: ["farm produce", "agro", "poultry", "fresh produce", "livestock"], blurb: "Earthy and fresh. For farm produce and agro sellers", isNew: true,
    preview: { bg: "#EEF0DD", ink: "#1F2B1A", line: "#E0E2CB", accent: "#2F5D2A", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
];

export const THEME_LIBRARY_IDS: readonly ThemeLibraryId[] = THEME_LIBRARY.map((item) => item.id);

/** The themes on the Free plan (shared/plans.ts "basic"): one for each main kind of shop. Paid plans have them all. */
export const BASIC_THEME_IDS: readonly string[] = ["plain", "breeze", "pantry", "ile", "plug", "ewa"];

export function isLibraryTheme(id: string | null | undefined): id is ThemeLibraryId {
  return typeof id === "string" && (THEME_LIBRARY_IDS as readonly string[]).includes(id);
}

export function themeLibraryEntry(id: string | null | undefined) {
  return THEME_LIBRARY.find((item) => item.id === id) ?? null;
}

/** "Afẹ́fẹ́ · Yoruba for breeze" */
export function themeMeaningLine(theme: Pick<ThemeLibraryEntry, "name" | "meaning">) {
  return `${theme.name} · ${theme.meaning}`;
}

/** A theme by id, slug or name, with or without diacritics ("Jẹ́jẹ́", "jeje", "plain" all find Jẹ́jẹ́). */
export function findLibraryTheme(query: string | null | undefined) {
  const folded = foldText(query).trim();
  if (!folded) return null;
  const slug = slugifyName(folded);
  return THEME_LIBRARY.find((theme) => theme.id === folded || theme.slug === slug || foldText(theme.name) === folded) ?? null;
}

/** Free-text search over names (diacritics optional), meanings, categories and industries. */
export function searchThemes(query: string | null | undefined, themes: readonly ThemeLibraryEntry[] = THEME_LIBRARY) {
  const words = foldText(query).split(/[^a-z0-9]+/).filter(Boolean);
  if (!words.length) return [...themes];
  return themes.filter((theme) => {
    const haystack = foldText([theme.id, theme.slug, theme.name, theme.meaning, theme.categoryLabel, theme.blurb, ...theme.categories, ...theme.industries].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

// ─── Category chips ─────────────────────────────────────────────────────────

export type ThemeChipId = "all" | Exclude<ThemeLibraryCategory, "any">;

export const THEME_CATEGORY_CHIPS: ReadonlyArray<{ id: ThemeChipId; label: string }> = [
  { id: "all", label: "All" },
  { id: "fashion", label: "Fashion" },
  { id: "beauty", label: "Beauty" },
  { id: "food", label: "Food" },
  { id: "home", label: "Home" },
  { id: "gadgets", label: "Gadgets" },
  { id: "kids", label: "Kids" },
  { id: "books", label: "Books" },
  { id: "events", label: "Events" },
  { id: "auto", label: "Auto" },
  { id: "groceries", label: "Groceries" },
  { id: "jewellery", label: "Jewellery" },
  { id: "agro", label: "Agro" },
];

/** "All" plus only the chips that have at least one theme. */
export function themeCategoryChips(themes: readonly ThemeLibraryEntry[] = THEME_LIBRARY) {
  return THEME_CATEGORY_CHIPS.filter((chip) => chip.id === "all" || themes.some((theme) => (theme.categories as string[]).includes(chip.id)));
}

export function filterThemes(category: string, themes: readonly ThemeLibraryEntry[] = THEME_LIBRARY) {
  if (!category || category === "all") return [...themes];
  return themes.filter((theme) => (theme.categories as string[]).includes(category));
}

// ─── Rule-based pick (used when no AI key is set, and to check what Rex says) ─

/**
 * Words per theme, most specific first: ties go to the earlier rule, so "lace wigs" lands on Ṣùkú (hair)
 * rather than Aṣọ Ẹbí (lace), and the general themes (Afẹ́fẹ́, Mama Put) only win when nothing narrower fits.
 * Matched on whole words with an optional plural, after folding accents.
 */
const THEME_RULES: Array<{ themeId: ThemeLibraryId; industry: string; words: string[] }> = [
  { themeId: "suku", industry: "hair and wigs", words: ["hair", "wig", "lace wig", "braid", "weave", "bundle", "frontal", "closure", "hair extension", "bonnet", "attachment", "crochet"] },
  { themeId: "turare", industry: "perfume", words: ["perfume", "fragrance", "oud", "cologne", "body mist", "scent", "attar", "turare", "humra", "turaren wuta", "perfume oil"] },
  { themeId: "ewa", industry: "beauty and skincare", words: ["beauty", "skincare", "skin care", "skin", "cosmetic", "makeup", "make-up", "make up", "lipstick", "lip gloss", "serum", "body butter", "shea butter", "black soap", "lotion", "face cream", "toner", "sunscreen", "nail", "lash", "spa", "glow", "wellness", "health", "supplement", "herbal"] },
  { themeId: "ileke", industry: "jewellery and beads", words: ["jewellery", "jewelry", "jewel", "bead", "waist bead", "coral", "necklace", "bracelet", "earring", "anklet", "pendant", "gold", "silver", "brooch"] },
  { themeId: "stride", industry: "shoes", words: ["shoe", "sneaker", "trainer", "footwear", "heel", "sandal", "slipper", "boot", "loafer", "slide", "kicks"] },
  { themeId: "agbada", industry: "menswear", words: ["agbada", "kaftan", "caftan", "senator", "menswear", "men's wear", "mens wear", "men's clothing", "tailor", "tailoring", "bespoke", "native wear", "suit", "babanriga", "buba", "sokoto", "cap", "fila"] },
  { themeId: "asoebi", industry: "fabrics and lace", words: ["fabric", "lace", "aso ebi", "asoebi", "aso-ebi", "aso oke", "george", "gele", "headtie", "head tie", "textile", "yard", "voile", "cord lace", "brocade", "ankara fabric", "wax print"] },
  { themeId: "adire", industry: "editorial fashion", words: ["adire", "tie-dye", "tie and dye", "batik", "kampala", "resort wear", "linen", "editorial"] },
  { themeId: "noir", industry: "luxury", words: ["luxury", "designer", "premium", "high-end", "high end", "watch", "wristwatch", "diamond"] },
  { themeId: "omo", industry: "kids and baby", words: ["kid", "kiddies", "child", "children", "children's", "baby", "babies", "toddler", "infant", "toy", "diaper", "nappy", "school bag", "school uniform", "maternity", "newborn", "teen"] },
  { themeId: "iwe", industry: "books and stationery", words: ["book", "novel", "bookshop", "bookstore", "stationery", "stationer", "notebook", "journal", "pen", "textbook", "magazine", "comic", "school supplies", "planner", "diary", "reading"] },
  { themeId: "owambe", industry: "events and rentals", words: ["event", "party", "party supplies", "rental", "rent", "hire", "canopy", "chair", "balloon", "souvenir", "owambe", "wedding", "birthday", "celebration", "backdrop", "decoration", "event decor"] },
  { themeId: "danfo", industry: "auto parts", words: ["car", "auto", "automobile", "automotive", "spare part", "car part", "auto part", "vehicle", "motor", "tyre", "tire", "brake", "brake pad", "engine", "car battery", "headlight", "headlamp", "wiper", "keke", "okada", "motorcycle", "mechanic", "rim", "lubricant", "engine oil", "car accessory", "car accessories"] },
  { themeId: "oko", industry: "farm produce", words: ["farm", "farmer", "agro", "agric", "agriculture", "agricultural", "poultry", "egg", "crate of eggs", "livestock", "fish farm", "catfish", "fertiliser", "fertilizer", "seed", "seedling", "produce", "harvest", "yam", "tuber", "cassava", "plantain", "fruit", "vegetable", "tomato", "organic", "cattle", "goat", "feed", "palm oil", "ugu"] },
  { themeId: "oja", industry: "groceries", words: ["grocery", "groceries", "grocer", "foodstuff", "provision", "supermarket", "mini mart", "minimart", "mart", "market", "household", "toiletries", "detergent", "beverage", "noodle", "indomie", "garri", "beans", "semovita", "rice", "vegetable oil", "general store", "essentials"] },
  { themeId: "chinchin", industry: "bakery and snacks", words: ["bakery", "bake", "baker", "baked", "baking", "cake", "cupcake", "pastry", "pastries", "bread", "chin chin", "chinchin", "puff puff", "puff-puff", "doughnut", "donut", "cookie", "biscuit", "meat pie", "pie", "plantain chips", "dessert", "sweets", "snack", "parfait", "waffle"] },
  { themeId: "ounje", industry: "restaurant and food delivery", words: ["restaurant", "food delivery", "meal", "meals", "jollof", "amala", "eba", "soup", "swallow", "buka", "chef", "catering", "caterer", "shawarma", "suya", "grill", "grilled", "lunch", "dinner", "breakfast", "menu", "kitchen", "takeaway", "take-away", "eatery", "fried rice", "pepper soup", "asun"] },
  { themeId: "pantry", industry: "food and drinks", words: ["food", "drink", "juice", "zobo", "kunu", "tigernut", "smoothie", "spice", "seasoning", "sauce", "pepper sauce", "honey", "tea", "coffee", "wine", "palm wine", "yoghurt", "yogurt", "small chops", "chops", "condiment"] },
  { themeId: "ile", industry: "home and living", words: ["home", "decor", "furniture", "living", "candle", "bedding", "interior", "homeware", "rug", "cushion", "vase", "lamp", "kitchenware", "cookware", "curtain", "throw pillow", "duvet", "bedsheet", "diffuser", "wall art"] },
  { themeId: "plug", industry: "gadgets", words: ["gadget", "phone", "iphone", "android", "electronic", "electronics", "tech", "laptop", "charger", "earbud", "earpod", "airpod", "headphone", "speaker", "power bank", "smartwatch", "console", "playstation", "camera", "tablet", "ipad", "phone accessories", "solar"] },
  { themeId: "breeze", industry: "fashion", words: ["fashion", "clothing", "clothes", "cloth", "wear", "dress", "gown", "top", "shirt", "t-shirt", "trouser", "jean", "apparel", "boutique", "bag", "handbag", "outfit", "skirt", "jumpsuit", "thrift", "okrika", "ankara", "abaya", "hijab", "kimono", "two-piece", "co-ord"] },
];

/** Fashion shops that mention prints or tie-dye get the editorial Adire rather than Afẹ́fẹ́. */
const EDITORIAL_WORDS = ["adire", "ankara", "aso", "kampala", "batik", "linen"];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD_PATTERNS = new Map<string, RegExp>();
function wordPattern(word: string) {
  let pattern = WORD_PATTERNS.get(word);
  if (!pattern) {
    pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(word)}(?:s|es)?(?=$|[^a-z0-9])`);
    WORD_PATTERNS.set(word, pattern);
  }
  return pattern;
}

function countMatches(text: string, words: string[]) {
  return words.reduce((total, word) => total + (wordPattern(word).test(text) ? 1 : 0), 0);
}

export interface ThemePickInput {
  /** What the seller said they sell during onboarding (free text). */
  storeCategory?: string | null;
  productNames?: string[];
  productCategories?: string[];
  currentThemeId?: string | null;
}

export interface ThemePick {
  themeId: ThemeLibraryId;
  /** The chip the pick sits under, or null when nothing matched. */
  category: Exclude<ThemeLibraryCategory, "any"> | null;
  /** What we think the shop sells ("hair and wigs"), or null. */
  industry: string | null;
  reason: string;
}

export function pickThemeByRules(input: ThemePickInput): ThemePick {
  const stated = foldText(input.storeCategory).replace(/&/g, " and ");
  const catalog = foldText([...(input.productNames ?? []), ...(input.productCategories ?? [])].join(" · "));
  let best: { rule: (typeof THEME_RULES)[number]; score: number } | null = null;
  for (const rule of THEME_RULES) {
    const score = countMatches(stated, rule.words) * 3 + countMatches(catalog, rule.words);
    if (score > 0 && (!best || score > best.score)) best = { rule, score };
  }
  if (!best) {
    return { themeId: "plain", category: null, industry: null, reason: "I couldn't tell what you sell yet, so Jẹ́jẹ́ is the safe pick: simple, fast and it works for any shop." };
  }
  let themeId = best.rule.themeId;
  if (themeId === "breeze" && countMatches(`${stated} ${catalog}`, EDITORIAL_WORDS) > 0) themeId = "adire";
  const theme = themeLibraryEntry(themeId)!;
  const category = theme.category === "any" ? null : theme.category;
  return {
    themeId,
    category,
    industry: best.rule.industry,
    reason: `Your shop looks like ${best.rule.industry}, so ${theme.name} fits: ${theme.blurb.split(". For")[0].toLowerCase()}.`,
  };
}

/** The gallery chip to open on for an onboarding category ("Hair and wigs" → beauty), or "all". */
export function chipForStoreCategory(value: string | null | undefined): ThemeChipId {
  if (!value || !value.trim()) return "all";
  const pick = pickThemeByRules({ storeCategory: value });
  return pick.category ?? "all";
}

// ─── Switching themes without losing the seller's content ──────────────────────

const CHROME_KINDS = new Set(["announcement-bar", "header", "footer"]);
/** Settings that describe the old theme's layout; the new theme's own values win. */
const LAYOUT_SETTING_KEYS = new Set(["layout", "drawerVariation", "variant", "columns", "style"]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function meaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function copyContent(section: TemplateSectionNode | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const block of section?.blocks ?? []) {
    if (block.type === "copy") Object.assign(out, block.content);
  }
  return out;
}

function findSeedSection(seedPage: TemplatePageSeed | undefined, section: TemplateSectionNode) {
  if (!seedPage) return undefined;
  return seedPage.sections.find((entry) => entry.id === section.id) ?? seedPage.sections.find((entry) => entry.kind === section.kind);
}

/** Copy the seller's own values from `previous` into `target` (same kind). Returns true when anything moved. */
function carrySection(target: TemplateSectionNode, previous: TemplateSectionNode, seed: TemplateSectionNode | undefined, hasSeed: boolean) {
  let carried = false;
  const prevCopy = copyContent(previous);
  const seedCopy = copyContent(seed);
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(prevCopy)) {
    if (!meaningful(value)) continue;
    if (hasSeed && seed && same(value, seedCopy[key])) continue;
    changes[key] = value;
  }
  if (Object.keys(changes).length) {
    const copyBlock = target.blocks.find((block) => block.type === "copy");
    if (copyBlock) copyBlock.content = { ...copyBlock.content, ...changes };
    else target.blocks = [...target.blocks, { id: `${target.id}-copy`, type: "copy", content: changes }];
    carried = true;
  }
  if (meaningful(previous.items) && !(hasSeed && seed && same(previous.items, seed.items))) {
    target.items = clone(previous.items);
    carried = true;
  }
  for (const [key, value] of Object.entries(previous.settings ?? {})) {
    if (LAYOUT_SETTING_KEYS.has(key) || value === undefined) continue;
    if (hasSeed && seed && same(value, seed.settings?.[key])) continue;
    if (!hasSeed && same(value, target.settings?.[key])) continue;
    target.settings = { ...(target.settings ?? {}), [key]: value };
    carried = true;
  }
  if (previous.visible === false && !(hasSeed && seed?.visible === false)) {
    target.visible = false;
    carried = true;
  }
  return carried;
}

export interface ThemeSwitchResult {
  snapshot: StoreEditorSnapshot;
  /** Sections whose content came across from the old theme. */
  carriedSections: number;
  /** Pages the new theme doesn't have, kept from the old draft. */
  keptPages: number;
}

/**
 * Switch a draft to a new theme. Takes the new theme's pages and layout, then brings across what the seller
 * wrote or chose (copy, images, picked products, hidden sections, SEO) wherever the section kinds match.
 * `previousSeed` is the old theme's untouched seed: values equal to it are template defaults, not the seller's,
 * and are left behind. Without it, everything in the old draft counts as the seller's.
 * Styles and backgrounds are not carried: they belong to the old theme's look.
 */
export function switchThemeDraft(previous: StoreEditorSnapshot | null | undefined, nextSeed: StoreEditorSnapshot, previousSeed?: StoreEditorSnapshot | null): ThemeSwitchResult {
  const next = clone(nextSeed);
  if (!previous || !Array.isArray(previous.pages)) return { snapshot: next, carriedSections: 0, keptPages: 0 };
  const hasSeed = Boolean(previousSeed && Array.isArray(previousSeed.pages));
  let carriedSections = 0;

  for (const page of next.pages) {
    const oldPage = previous.pages.find((entry) => entry.pageType === page.pageType);
    if (!oldPage) continue;
    const seedPage = hasSeed ? previousSeed!.pages.find((entry) => entry.pageType === page.pageType) : undefined;
    const used = new Set<string>();

    for (const section of page.sections) {
      const candidates = oldPage.sections.filter((entry) => entry.kind === section.kind && !used.has(entry.id));
      const source = section.settings?.source;
      const match = candidates.find((entry) => source !== undefined && entry.settings?.source === source) ?? candidates[0];
      if (!match) continue;
      used.add(match.id);
      if (carrySection(section, match, findSeedSection(seedPage, match), hasSeed)) carriedSections += 1;
    }

    // Sections the seller added themselves (not in the old seed) come along even when the new theme has no
    // matching slot; the renderer shows their title and text.
    if (hasSeed) {
      const added = oldPage.sections.filter((entry) => !used.has(entry.id) && !CHROME_KINDS.has(entry.kind) && !seedPage?.sections.some((seed) => seed.id === entry.id));
      if (added.length) {
        const footerIndex = page.sections.findIndex((entry) => entry.kind === "footer");
        const at = footerIndex === -1 ? page.sections.length : footerIndex;
        page.sections.splice(at, 0, ...clone(added));
        carriedSections += added.length;
      }
    }

    if (oldPage.seo && meaningful(oldPage.seo.metaTitle + oldPage.seo.metaDescription) && !(seedPage && same(oldPage.seo, seedPage.seo))) {
      page.seo = clone(oldPage.seo);
    }
  }

  let keptPages = 0;
  for (const oldPage of previous.pages) {
    if (next.pages.some((entry) => entry.pageType === oldPage.pageType)) continue;
    const seedPage = hasSeed ? previousSeed!.pages.find((entry) => entry.pageType === oldPage.pageType) : undefined;
    if (seedPage && same(seedPage.sections, oldPage.sections)) continue;
    next.pages.push(clone(oldPage));
    keptPages += 1;
  }

  next.updatedAt = new Date().toISOString();
  return { snapshot: next, carriedSections, keptPages };
}
