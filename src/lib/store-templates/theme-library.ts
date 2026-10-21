// The 2026 theme library: the storefront themes the seller picks from on /builder/templates and in the
// builder's Themes view. Pure data and helpers (no imports with side effects), so tests can load it directly.
//
// Display names are Nigerian (Yoruba, Hausa, Pidgin and Naija slang). Ids never change (stores keep working
// on old ids); search folds diacritics, so "afefe", "Afẹ́fẹ́" and "breeze" all find the same theme.

import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode } from "./types";

export type ThemeLibraryId =
  | "breeze" | "noir" | "plain" | "adire" | "pantry" | "ile" | "plug" | "stride"
  | "ewa" | "suku" | "asoebi" | "agbada" | "ileke" | "ounje" | "chinchin" | "oja" | "omo" | "iwe" | "owambe" | "danfo" | "turare" | "oko"
  | "aaro" | "highlife" | "oba" | "gbedu"
  | "omalicha" | "zuma" | "oku" | "ihe" | "kasuwa" | "nkata" | "uwa" | "sarauniya" | "zinariya"
  | "irawo" | "asa" | "mmiri" | "uzo" | "rawa" | "fitila" | "oso" | "shakara"
  | "aga" | "itura" | "gele" | "imani" | "itanna"
  | "littafi" | "itan" | "awo" | "kyau" | "keke"
  | "ahia" | "ado" | "wuta" | "ike" | "ewu"
  | "erin" | "apere" | "bata" | "ogba" | "eso"
  | "osan" | "ijokoo" | "ite" | "kujera" | "tufafi"
  | "rewa" | "igbese" | "ola" | "okunrin" | "salubata";

/**
 * Which plan a theme needs: basic themes come with every store (the free Starter plan), premium ones with Growth
 * and up, platinum ones only with Seller Pro. A store keeps the theme it already has when its plan changes; the
 * tier only decides which themes it can switch to (src/lib/theme-access.ts).
 */
export type ThemeTier = "basic" | "premium" | "platinum";

export const THEME_TIERS: readonly ThemeTier[] = ["basic", "premium", "platinum"];

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
  tier: ThemeTier;
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
    industries: ["fashion", "clothing", "boutique", "bags"], blurb: "Airy and clean, big product pages. For fashion", isNew: false, tier: "basic",
    preview: { bg: "#E8F6F7", ink: "#1A1D21", line: "#C9DFE1", accent: "#1FC6D6", nameFont: "grotesk", nameWeight: 400, dark: false },
  }),
  entry({
    id: "noir", name: "Dúdú", meaning: "Yoruba for black", categories: ["fashion", "jewellery"], categoryLabel: "Luxury",
    industries: ["luxury", "designer", "watches", "premium fashion"], blurb: "Dark and premium, with payday countdowns. For luxury", isNew: false, tier: "platinum",
    preview: { bg: "#141414", ink: "#F5F2EA", line: "#3A3936", accent: "#C8A96A", nameFont: "serif", nameWeight: 600, dark: true },
  }),
  entry({
    id: "plain", name: "Jẹ́jẹ́", meaning: "Yoruba for gentle, easy-going", categories: ["any"], categoryLabel: "Any shop",
    industries: ["any", "general", "minimal"], blurb: "Simple and fast. Works for anything", isNew: false, tier: "basic",
    preview: { bg: "#F2F2F2", ink: "#111111", line: "#DADADA", accent: "#111111", nameFont: "grotesk", nameWeight: 400, dark: false },
  }),
  entry({
    id: "adire", name: "Adire", meaning: "Yoruba indigo tie-dye cloth", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["fashion", "adire", "ankara", "editorial"], blurb: "Editorial, photo-led. For fashion", isNew: false, tier: "premium",
    preview: { bg: "#F3ECE5", ink: "#2B1D14", line: "#DDCFC1", accent: "#B8612F", nameFont: "serif", nameWeight: 400, dark: false },
  }),
  entry({
    id: "pantry", name: "Mama Put", meaning: "Naija for the neighbourhood food seller", categories: ["food"], categoryLabel: "Food and drinks",
    industries: ["food", "drinks", "zobo", "spices", "sauces", "small chops"], blurb: "Warm and bold. For food and drinks", isNew: false, tier: "basic",
    preview: { bg: "#FFF2D8", ink: "#3A1E0B", line: "#EBD7AE", accent: "#E2541B", nameFont: "sans", nameWeight: 800, dark: false },
  }),
  entry({
    id: "ile", name: "Ilé", meaning: "Yoruba for home", categories: ["home"], categoryLabel: "Home and living",
    industries: ["home", "decor", "furniture", "homeware"], blurb: "Calm and roomy. For home and decor", isNew: false, tier: "basic",
    preview: { bg: "#E6EDE8", ink: "#1F2A24", line: "#CBD6CE", accent: "#5E7464", nameFont: "serif", nameWeight: 700, dark: false },
  }),
  entry({
    id: "plug", name: "Plug", meaning: "Naija slang for the person who can get it for you", categories: ["gadgets"], categoryLabel: "Gadgets",
    industries: ["gadgets", "phones", "electronics", "accessories"], blurb: "Dark and sharp. For gadgets", isNew: false, tier: "basic",
    preview: { bg: "#17181D", ink: "#F2F4F7", line: "#33363F", accent: "#5B8CFF", nameFont: "grotesk", nameWeight: 500, dark: true },
  }),
  entry({
    id: "stride", name: "Waka", meaning: "Pidgin for walk", categories: ["fashion"], categoryLabel: "Shoes",
    industries: ["shoes", "sneakers", "footwear", "sportswear"], blurb: "Loud and sporty. For shoes", isNew: false, tier: "premium",
    preview: { bg: "#FDE6DA", ink: "#141414", line: "#F0C9B5", accent: "#FF4D1F", nameFont: "sans", nameWeight: 800, dark: false },
  }),
  entry({
    id: "ewa", name: "Ẹwà", meaning: "Yoruba for beauty", categories: ["beauty"], categoryLabel: "Beauty and skincare",
    industries: ["beauty", "skincare", "cosmetics", "makeup", "body care"], blurb: "Soft and glowing, ingredient-led. For beauty and skincare", isNew: true, tier: "premium",
    preview: { bg: "#F9E7E1", ink: "#3B1F1A", line: "#F0D9D1", accent: "#C2566B", nameFont: "serif", nameWeight: 500, nameItalic: true, dark: false },
  }),
  entry({
    id: "suku", name: "Ṣùkú", meaning: "Yoruba crown braid style", categories: ["beauty"], categoryLabel: "Hair and wigs",
    industries: ["hair", "wigs", "braids", "hair extensions", "hair care"], blurb: "Bold and glam, made for units and lengths. For hair and wigs", isNew: true, tier: "premium",
    preview: { bg: "#F6E7F0", ink: "#2A1630", line: "#EFDCE7", accent: "#E0679E", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "asoebi", name: "Aṣọ Ẹbí", meaning: "Yoruba for family cloth, the owambe uniform", categories: ["fashion"], categoryLabel: "Fabrics and lace",
    industries: ["fabrics", "lace", "ankara", "aso oke", "george", "gele"], blurb: "Rich and regal, fabric up close. For lace, ankara and aso-ebi", isNew: true, tier: "premium",
    preview: { bg: "#F5EBDD", ink: "#2B1530", line: "#EADCC8", accent: "#D4A13A", nameFont: "serif", nameWeight: 600, dark: false },
  }),
  entry({
    id: "agbada", name: "Agbada", meaning: "The flowing Yoruba robe for big occasions", categories: ["fashion"], categoryLabel: "Menswear",
    industries: ["menswear", "tailoring", "native wear", "kaftan", "senator"], blurb: "Sharp and tailored. For menswear and tailors", isNew: true, tier: "platinum",
    preview: { bg: "#ECE8DF", ink: "#1A1F1C", line: "#DDD8CC", accent: "#B08D57", nameFont: "serif", nameWeight: 600, dark: false },
  }),
  entry({
    id: "ileke", name: "Ìlẹ̀kẹ̀", meaning: "Yoruba for beads", categories: ["jewellery"], categoryLabel: "Jewellery and beads",
    industries: ["jewellery", "beads", "accessories", "waist beads", "coral"], blurb: "Delicate and close-up. For jewellery and beads", isNew: true, tier: "premium",
    preview: { bg: "#F6EBDD", ink: "#2E1B12", line: "#EADBC8", accent: "#C8462C", nameFont: "serif", nameWeight: 400, nameItalic: true, dark: false },
  }),
  entry({
    id: "ounje", name: "Oúnjẹ", meaning: "Yoruba for food", categories: ["food"], categoryLabel: "Restaurant",
    industries: ["restaurant", "food delivery", "kitchen", "catering", "buka"], blurb: "A menu, not a catalogue: order on WhatsApp up front. For restaurants", isNew: true, tier: "premium",
    preview: { bg: "#FEF3C7", ink: "#1C1917", line: "#F1E3B8", accent: "#F59E0B", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "chinchin", name: "Chin Chin", meaning: "Naija's favourite crunchy snack", categories: ["food"], categoryLabel: "Bakery and snacks",
    industries: ["bakery", "cakes", "pastries", "snacks", "desserts"], blurb: "Sweet and playful. For cakes, pastries and snacks", isNew: true, tier: "premium",
    preview: { bg: "#FBE7D9", ink: "#4A2511", line: "#F2DCCB", accent: "#D9467A", nameFont: "serif", nameWeight: 700, dark: false },
  }),
  entry({
    id: "oja", name: "Ọjà", meaning: "Yoruba for market", categories: ["groceries"], categoryLabel: "Groceries",
    industries: ["groceries", "supermarket", "foodstuff", "provisions", "household"], blurb: "Dense and quick, aisles first. For groceries and general stores", isNew: true, tier: "basic",
    preview: { bg: "#F1F6F2", ink: "#14231A", line: "#E1E9E3", accent: "#0F7A3D", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "omo", name: "Ọmọ", meaning: "Yoruba for child", categories: ["kids"], categoryLabel: "Kids and baby",
    industries: ["kids", "baby", "toys", "children's clothing", "maternity"], blurb: "Bright and friendly. For kids and baby", isNew: true, tier: "basic",
    preview: { bg: "#FFF3C4", ink: "#1F2A44", line: "#F2E2A0", accent: "#3D7BF7", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "iwe", name: "Ìwé", meaning: "Yoruba for book", categories: ["books"], categoryLabel: "Books and stationery",
    industries: ["books", "bookshop", "stationery", "school supplies"], blurb: "Quiet and literary, covers on a shelf. For books and stationery", isNew: true, tier: "basic",
    preview: { bg: "#F1E9DA", ink: "#1E2235", line: "#E4DCCB", accent: "#B4432F", nameFont: "serif", nameWeight: 500, dark: false },
  }),
  entry({
    id: "owambe", name: "Owambe", meaning: "Naija for a big, joyful party", categories: ["events"], categoryLabel: "Events and rentals",
    industries: ["events", "party supplies", "rentals", "decor hire", "souvenirs"], blurb: "Festive and gold. For party supplies, rentals and events", isNew: true, tier: "premium",
    preview: { bg: "#2D0B3A", ink: "#FFF4D6", line: "#4A2459", accent: "#F2B705", nameFont: "serif", nameWeight: 600, nameItalic: true, dark: true },
  }),
  entry({
    id: "danfo", name: "Danfo", meaning: "Lagos' yellow bus", categories: ["auto"], categoryLabel: "Auto parts",
    industries: ["auto parts", "car accessories", "spare parts", "tyres", "lubricants"], blurb: "Yellow, black and search-first. For auto parts", isNew: true, tier: "premium",
    preview: { bg: "#FFC400", ink: "#111111", line: "#E0AC00", accent: "#111111", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "turare", name: "Turare", meaning: "Hausa for perfume", categories: ["beauty"], categoryLabel: "Perfume",
    industries: ["perfume", "fragrance", "oud", "body mist", "perfume oils"], blurb: "Moody and elegant, bottles on a glow. For perfume and fragrance", isNew: true, tier: "platinum",
    preview: { bg: "#1B1420", ink: "#F7EFE3", line: "#3A2E40", accent: "#C9A46A", nameFont: "serif", nameWeight: 500, dark: true },
  }),
  entry({
    id: "oko", name: "Oko", meaning: "Yoruba for farm", categories: ["agro"], categoryLabel: "Farm produce",
    industries: ["farm produce", "agro", "poultry", "fresh produce", "livestock"], blurb: "Earthy and fresh. For farm produce and agro sellers", isNew: true, tier: "premium",
    preview: { bg: "#EEF0DD", ink: "#1F2B1A", line: "#E0E2CB", accent: "#2F5D2A", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "aaro", name: "Àárọ̀", meaning: "Yoruba for morning", categories: ["any", "fashion"], categoryLabel: "Any shop",
    industries: ["any", "general", "minimal", "clothing"], blurb: "Clean and photo-first, your products up front. Works for anything", isNew: true, tier: "basic",
    preview: { bg: "#F3F3F3", ink: "#121212", line: "#DEDEDE", accent: "#121212", nameFont: "sans", nameWeight: 500, dark: false },
  }),
  entry({
    id: "highlife", name: "Highlife", meaning: "The West African dance music of the 60s and 70s", categories: ["fashion", "beauty", "home"], categoryLabel: "Lifestyle brands",
    industries: ["lifestyle", "streetwear", "accessories", "gifts", "brand"], blurb: "Retro and colourful, with a moving ticker and sticker badges. For lifestyle brands", isNew: true, tier: "premium",
    preview: { bg: "#F6EFE3", ink: "#1E1B4B", line: "#E4D8C2", accent: "#E4572E", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "oba", name: "Ọba", meaning: "Yoruba for king", categories: ["fashion", "jewellery", "beauty"], categoryLabel: "Luxury",
    industries: ["luxury", "designer", "premium fashion", "fine jewellery", "couture"], blurb: "Quiet luxury: full-screen photos, fine serif type. For premium brands", isNew: true, tier: "platinum",
    preview: { bg: "#F1EDE6", ink: "#1C1C1C", line: "#E2DCD1", accent: "#9C7C4F", nameFont: "serif", nameWeight: 400, dark: false },
  }),
  entry({
    id: "gbedu", name: "Gbẹ̀du", meaning: "Yoruba royal drum; Naija for a hard-hitting beat", categories: ["gadgets", "fashion"], categoryLabel: "Bold brands",
    industries: ["audio", "tech", "streetwear", "sneakers", "gaming", "music"], blurb: "Dark and loud: giant headlines, glowing gradients. For bold tech and streetwear", isNew: true, tier: "platinum",
    preview: { bg: "#0B0B0F", ink: "#F5F5F7", line: "#26262E", accent: "#8B5CF6", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "omalicha", name: "Ọmalịcha", meaning: "Igbo for beautiful", categories: ["beauty"], categoryLabel: "Beauty and wellness",
    industries: ["beauty", "skincare", "wellness", "body care", "self-care"], blurb: "Soft and pastel, headline in a floating card. For beauty and wellness", isNew: true, tier: "basic",
    preview: { bg: "#F7ECF4", ink: "#3A2341", line: "#EEDDEA", accent: "#B3477D", nameFont: "grotesk", nameWeight: 600, dark: false },
  }),
  entry({
    id: "zuma", name: "Zuma", meaning: "Hausa for honey", categories: ["home", "any"], categoryLabel: "Handmade",
    industries: ["handmade", "crafts", "artisan", "pottery", "candles", "leather goods"], blurb: "Warm and handmade, with a maker's letter. For crafts and artisans", isNew: true, tier: "basic",
    preview: { bg: "#F2E8D8", ink: "#3B2A1A", line: "#E6D8C3", accent: "#B8792C", nameFont: "serif", nameWeight: 600, dark: false },
  }),
  entry({
    id: "oku", name: "Ọkụ", meaning: "Igbo for fire", categories: ["fashion"], categoryLabel: "Sport and activewear",
    industries: ["sportswear", "activewear", "fitness", "gym", "football", "running"], blurb: "Fast and slanted, black and lime. For sport and activewear", isNew: true, tier: "basic",
    preview: { bg: "#0F0F0F", ink: "#FFFFFF", line: "#2A2A2A", accent: "#D4FF3A", nameFont: "grotesk", nameWeight: 800, nameItalic: true, dark: true },
  }),
  entry({
    id: "ihe", name: "Ìhè", meaning: "Igbo for light", categories: ["home", "any"], categoryLabel: "Art and prints",
    industries: ["art", "prints", "paintings", "photography", "gallery", "objects"], blurb: "A quiet gallery wall with lots of space. For art, prints and objects", isNew: true, tier: "basic",
    preview: { bg: "#F5F3EF", ink: "#1A1A1A", line: "#E7E4DE", accent: "#C2410C", nameFont: "serif", nameWeight: 400, dark: false },
  }),
  entry({
    id: "kasuwa", name: "Kasuwa", meaning: "Hausa for market", categories: ["groceries", "gadgets", "any"], categoryLabel: "Big catalogues",
    industries: ["general store", "supermarket", "electronics", "wholesale", "big catalogue", "department store"], blurb: "Promo mosaic, departments and a full filters column. For big catalogues", isNew: true, tier: "premium",
    preview: { bg: "#E8EEF8", ink: "#0F1B33", line: "#DDE3EE", accent: "#0B3B8C", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "nkata", name: "Nkata", meaning: "Igbo for basket, and for a good conversation", categories: ["fashion", "home"], categoryLabel: "Classic",
    industries: ["fashion", "homeware", "accessories", "classic", "family store"], blurb: "Classic and balanced, with a framed banner. Works for most shops", isNew: true, tier: "premium",
    preview: { bg: "#F4F1EC", ink: "#22292F", line: "#E3DFD8", accent: "#A3684A", nameFont: "serif", nameWeight: 500, dark: false },
  }),
  entry({
    id: "uwa", name: "Ụwa", meaning: "Igbo for world", categories: ["fashion", "books"], categoryLabel: "Magazine",
    industries: ["lifestyle", "fashion", "editorial", "concept store", "journal"], blurb: "A magazine cover and an 'in this issue' list. For editorial brands", isNew: true, tier: "premium",
    preview: { bg: "#F0EBE1", ink: "#111111", line: "#E2DCD0", accent: "#D7263D", nameFont: "serif", nameWeight: 700, nameItalic: true, dark: false },
  }),
  entry({
    id: "sarauniya", name: "Sarauniya", meaning: "Hausa for queen", categories: ["fashion"], categoryLabel: "Womenswear",
    industries: ["womenswear", "fashion house", "designer", "occasion wear", "bridal"], blurb: "Two photos side by side, headline across the seam. For fashion houses", isNew: true, tier: "platinum",
    preview: { bg: "#EDE7DF", ink: "#1A1A1A", line: "#E0D9CF", accent: "#C9A27E", nameFont: "serif", nameWeight: 500, dark: false },
  }),
  entry({
    id: "zinariya", name: "Zinariya", meaning: "Hausa for gold", categories: ["jewellery"], categoryLabel: "Fine jewellery",
    industries: ["fine jewellery", "gold", "diamonds", "bridal jewellery", "watches"], blurb: "Gold on deep emerald, an arched frame. For fine jewellery", isNew: true, tier: "platinum",
    preview: { bg: "#0F2E26", ink: "#F5ECD7", line: "#2A4A40", accent: "#C9A24A", nameFont: "serif", nameWeight: 500, dark: true },
  }),
  entry({
    id: "irawo", name: "Ìràwọ̀", meaning: "Yoruba for star", categories: ["any", "beauty"], categoryLabel: "One-product brands",
    industries: ["single product", "brand", "hero product", "gadget brand", "beauty brand"], blurb: "Your star product, big, with its real name and price. For one-product brands", isNew: true, tier: "basic",
    preview: { bg: "#FFE8D6", ink: "#2B1B17", line: "#F3DDCB", accent: "#FF5A36", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "asa", name: "Àṣà", meaning: "Yoruba for culture and tradition", categories: ["food", "home"], categoryLabel: "Heritage food and craft",
    industries: ["spices", "traditional food", "heritage", "condiments", "local crafts"], blurb: "A heritage stamp and range banners. For traditional food and craft", isNew: true, tier: "basic",
    preview: { bg: "#EFE3CF", ink: "#2E2A1F", line: "#E3D5BD", accent: "#9E3B22", nameFont: "serif", nameWeight: 700, dark: false },
  }),
  entry({
    id: "mmiri", name: "Mmiri", meaning: "Igbo for water", categories: ["food"], categoryLabel: "Drinks",
    industries: ["drinks", "juice", "water", "beverages", "smoothies", "zobo"], blurb: "Blue waves and a sunny bottle. For drinks and juice brands", isNew: true, tier: "basic",
    preview: { bg: "#DCEBFF", ink: "#0B2545", line: "#CFE0F5", accent: "#0B6BCB", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "uzo", name: "Ụzọ", meaning: "Igbo for road or path", categories: ["fashion", "home"], categoryLabel: "Editorial",
    industries: ["travel gear", "outdoor", "fashion", "bags", "editorial"], blurb: "Words pinned while pictures scroll, and a lookbook. For brands with a story", isNew: true, tier: "premium",
    preview: { bg: "#ECEAE3", ink: "#1C1B18", line: "#DEDBD2", accent: "#3D5A40", nameFont: "grotesk", nameWeight: 600, dark: false },
  }),
  entry({
    id: "rawa", name: "Rawa", meaning: "Hausa for dance", categories: ["fashion", "events"], categoryLabel: "Party and playful",
    industries: ["party wear", "accessories", "costume", "colourful fashion", "nightlife"], blurb: "Hot pink, fanned photo cards and a ticker. For playful brands", isNew: true, tier: "premium",
    preview: { bg: "#FF3D7F", ink: "#FFFFFF", line: "#FF7AA8", accent: "#FFE14D", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "fitila", name: "Fitila", meaning: "Hausa for lamp", categories: ["home"], categoryLabel: "Home and lighting",
    industries: ["lighting", "lamps", "furniture", "interiors", "home decor"], blurb: "A room photo with glowing product pins. For home and lighting", isNew: true, tier: "premium",
    preview: { bg: "#2A2420", ink: "#F5EFE6", line: "#43392F", accent: "#E8A33D", nameFont: "serif", nameWeight: 500, dark: true },
  }),
  entry({
    id: "oso", name: "Ọ̀ṣọ́", meaning: "Yoruba for adornment", categories: ["fashion", "jewellery"], categoryLabel: "Fashion editorial",
    industries: ["fashion", "accessories", "designer", "ready to wear", "editorial"], blurb: "A bento grid of looks and a lookbook. For fashion labels", isNew: true, tier: "platinum",
    preview: { bg: "#F2EDE6", ink: "#141414", line: "#E6E0D8", accent: "#B23A48", nameFont: "serif", nameWeight: 500, dark: false },
  }),
  entry({
    id: "shakara", name: "Shakara", meaning: "Naija for swagger and showing off", categories: ["fashion"], categoryLabel: "Streetwear",
    industries: ["streetwear", "drops", "sneakers", "caps", "urban fashion"], blurb: "A street poster with numbered drops. For streetwear labels", isNew: true, tier: "platinum",
    preview: { bg: "#0A0A0A", ink: "#F1F1EC", line: "#2A2A2A", accent: "#FF4F00", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "aga", name: "Àga", meaning: "Yoruba for chair", categories: ["home"], categoryLabel: "Furniture",
    industries: ["furniture", "chairs", "tables", "home decor", "interiors"], blurb: "A sidebar menu and a masonry wall of products. For furniture", isNew: true, tier: "platinum",
    preview: { bg: "#F5F7FA", ink: "#131212", line: "#EBEBEB", accent: "#FBB710", nameFont: "grotesk", nameWeight: 600, dark: false },
  }),
  entry({
    id: "itura", name: "Ìtura", meaning: "Yoruba for comfort and relief", categories: ["home", "any"], categoryLabel: "Home and lifestyle",
    industries: ["furniture", "sofas", "lifestyle", "home goods", "comfort"], blurb: "Pale aqua, a cut-out product banner and tinted cards. For home and lifestyle", isNew: true, tier: "basic",
    preview: { bg: "#ECFDFF", ink: "#222222", line: "#D8F3F6", accent: "#FF3368", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "gele", name: "Gèlè", meaning: "Yoruba for the headtie", categories: ["fashion", "beauty"], categoryLabel: "Fashion",
    industries: ["fashion", "womenswear", "accessories", "cosmetics", "kidswear"], blurb: "A mosaic banner, category tabs and three product lists. For fashion stores", isNew: true, tier: "premium",
    preview: { bg: "#FDE8E2", ink: "#111111", line: "#F2D2C8", accent: "#CA1515", nameFont: "serif", nameWeight: 500, nameItalic: true, dark: false },
  }),
  entry({
    id: "imani", name: "Imani", meaning: "Hausa for faith", categories: ["fashion", "any"], categoryLabel: "Department store",
    industries: ["department store", "fashion", "menswear", "womenswear", "multi-category"], blurb: "A category bar, a his-and-hers banner and big-word categories. For department stores", isNew: true, tier: "premium",
    preview: { bg: "#3B2E5A", ink: "#FFFFFF", line: "#54467A", accent: "#4FC1E9", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "itanna", name: "Ìtànná", meaning: "Yoruba for flower, a bloom", categories: ["fashion", "any"], categoryLabel: "Sneakers and minimal",
    industries: ["sneakers", "shoes", "minimal", "product grid", "small catalogue"], blurb: "A centred headline, then product cards with quick add. Simple and fast", isNew: true, tier: "basic",
    preview: { bg: "#FFFBEB", ink: "#262626", line: "#F5E6C4", accent: "#F59E0B", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "littafi", name: "Littafi", meaning: "Hausa for book", categories: ["books"], categoryLabel: "Books and stationery",
    industries: ["books", "bookshop", "novels", "children's books", "stationery"], blurb: "Pastel banners, best sellers and four product lists. For bookshops", isNew: true, tier: "basic",
    preview: { bg: "#FCE7EF", ink: "#1F1F1F", line: "#F3D3DF", accent: "#F86D72", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "itan", name: "Ìtàn", meaning: "Yoruba for story and history", categories: ["books"], categoryLabel: "Literary",
    industries: ["books", "literary fiction", "rare books", "publisher", "poetry"], blurb: "Warm beige and serif, a book of the month and a quote of the day. For literary bookshops", isNew: true, tier: "platinum",
    preview: { bg: "#EFEEE8", ink: "#2F2F2F", line: "#E0DDD3", accent: "#9C7A54", nameFont: "serif", nameWeight: 500, dark: false },
  }),
  entry({
    id: "awo", name: "Àwọ̀", meaning: "Yoruba for colour", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["fashion", "clothing", "accessories", "menswear", "womenswear"], blurb: "Clean and red, labelled category photos and a deal countdown. For fashion stores", isNew: true, tier: "basic",
    preview: { bg: "#F4F4F4", ink: "#1E1E27", line: "#E6E6E6", accent: "#FE4C50", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "kyau", name: "Kyau", meaning: "Hausa for beauty and goodness", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["fashion", "clothing", "watches", "bags", "shoes"], blurb: "Soft periwinkle, bordered category cards and framed stories. For fashion stores", isNew: true, tier: "premium",
    preview: { bg: "#E9ECF2", ink: "#222222", line: "#D9DDE8", accent: "#717FE0", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "keke", name: "Keke", meaning: "Hausa for bicycle", categories: ["auto", "gadgets"], categoryLabel: "Bikes and sport",
    industries: ["bicycles", "bikes", "scooters", "cycling", "sport equipment"], blurb: "A slanted banner and products on angled panels. For bikes and sport gear", isNew: true, tier: "premium",
    preview: { bg: "#2B5061", ink: "#FFFFFF", line: "#3E6676", accent: "#F7BE74", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "ahia", name: "Ahịa", meaning: "Igbo for market", categories: ["any", "gadgets"], categoryLabel: "Marketplace",
    industries: ["general store", "variety store", "fashion and gadgets", "accessories", "multi-category"], blurb: "A search-first header, a yellow banner and a row per category. For shops that sell a bit of everything", isNew: true, tier: "basic",
    preview: { bg: "#F9C21B", ink: "#1F1F1F", line: "#E8B30F", accent: "#262626", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "ado", name: "Àdó", meaning: "Hausa for adornment", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["menswear", "fashion", "sneakers", "watches", "bags"], blurb: "Green and sharp, a promo panel and one new product shown large. For fashion stores", isNew: true, tier: "premium",
    preview: { bg: "#2A4F9E", ink: "#FFFFFF", line: "#3B62B3", accent: "#71CD14", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "wuta", name: "Wuta", meaning: "Hausa for fire and power", categories: ["gadgets"], categoryLabel: "Electronics",
    industries: ["electronics", "gadgets", "phones", "appliances", "cameras"], blurb: "Orange, a search header and a product card beside the banner. For gadget stores", isNew: true, tier: "basic",
    preview: { bg: "#F4F4F4", ink: "#222222", line: "#E6E6E6", accent: "#F28B00", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "ike", name: "Ike", meaning: "Igbo for strength and power", categories: ["gadgets"], categoryLabel: "Electronics",
    industries: ["electronics", "laptops", "phones", "cameras", "accessories"], blurb: "Navy and red, diagonal collection tiles and top-selling lists. For electronics stores", isNew: true, tier: "platinum",
    preview: { bg: "#15161D", ink: "#FFFFFF", line: "#2B2D42", accent: "#D10024", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "ewu", name: "Ẹ̀wù", meaning: "Yoruba for garment", categories: ["fashion", "kids"], categoryLabel: "Family fashion",
    industries: ["family fashion", "womenswear", "menswear", "kids clothing", "bags and shoes"], blurb: "Lavender, a category menu beside the banner and category cards with counts. For fashion stores", isNew: true, tier: "premium",
    preview: { bg: "#EDF1FF", ink: "#1C1C1C", line: "#DDE3F7", accent: "#D19C97", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "erin", name: "Ẹ̀rín", meaning: "Yoruba for laughter", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["fashion", "casual wear", "hoodies", "shirts", "dresses"], blurb: "Red and navy, a split banner and navy service cards. For friendly fashion stores", isNew: true, tier: "basic",
    preview: { bg: "#E9E6E6", ink: "#002C3E", line: "#DAD6D6", accent: "#F7444E", nameFont: "serif", nameWeight: 700, dark: false },
  }),
  entry({
    id: "apere", name: "Apẹ̀rẹ̀", meaning: "Yoruba for basket", categories: ["groceries", "food"], categoryLabel: "Groceries",
    industries: ["groceries", "supermarket", "juice", "bakery", "snacks"], blurb: "A banner trio, quick add and a search header. For grocery stores", isNew: true, tier: "premium",
    preview: { bg: "#E6F3FB", ink: "#222222", line: "#D3E7F3", accent: "#F2A900", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "bata", name: "Bàtà", meaning: "Yoruba for shoes", categories: ["fashion"], categoryLabel: "Shoes",
    industries: ["shoes", "heels", "loafers", "sneakers", "boots"], blurb: "Calm and serif, two big collection photos and a bordered grid. For shoe stores", isNew: true, tier: "basic",
    preview: { bg: "#F2F2F2", ink: "#222222", line: "#E4E4E4", accent: "#5FAE9F", nameFont: "serif", nameWeight: 600, dark: false },
  }),
  entry({
    id: "ogba", name: "Ọgbà", meaning: "Yoruba for garden", categories: ["groceries", "agro"], categoryLabel: "Fresh produce",
    industries: ["fresh produce", "vegetables", "fruit", "farm shop", "greengrocer"], blurb: "Olive and black, a photo slider and captioned category photos. For produce shops", isNew: true, tier: "premium",
    preview: { bg: "#1E1E1E", ink: "#FFFFFF", line: "#333333", accent: "#B0B435", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "eso", name: "Èso", meaning: "Yoruba for fruit", categories: ["groceries", "agro", "food"], categoryLabel: "Fresh produce",
    industries: ["fruit", "vegetables", "organic food", "juice", "farm produce"], blurb: "Green and orange, a search banner and an orange story band. For fruit and veg stores", isNew: true, tier: "platinum",
    preview: { bg: "#F4F8EC", ink: "#3B4D4F", line: "#E3EDD3", accent: "#81C408", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "osan", name: "Ọsàn", meaning: "Yoruba for orange", categories: ["groceries", "food"], categoryLabel: "Fresh produce",
    industries: ["fruit", "juice", "fruit baskets", "fresh produce", "smoothies"], blurb: "Dark slate and orange, a photo banner and quick-add product cards. For fruit shops", isNew: true, tier: "basic",
    preview: { bg: "#051922", ink: "#FFFFFF", line: "#1B3340", accent: "#F28123", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "ijokoo", name: "Ìjókòó", meaning: "Yoruba for seat", categories: ["home"], categoryLabel: "Furniture",
    industries: ["furniture", "chairs", "sofas", "lighting", "home decor"], blurb: "A pale showroom banner, a category trio and a dark side panel. For furniture stores", isNew: true, tier: "premium",
    preview: { bg: "#F6F7FB", ink: "#2B2B2B", line: "#E6E8F0", accent: "#E6A23C", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "ite", name: "Ìtẹ́", meaning: "Yoruba for nest", categories: ["home"], categoryLabel: "Interiors",
    industries: ["furniture", "interior design", "sofas", "home decor", "furniture makers"], blurb: "Deep green and yellow, a photo collage and service tiles. For interior studios", isNew: true, tier: "platinum",
    preview: { bg: "#3B5D50", ink: "#FFFFFF", line: "#4E7163", accent: "#F9BF29", nameFont: "grotesk", nameWeight: 700, dark: true },
  }),
  entry({
    id: "kujera", name: "Kujera", meaning: "Hausa for chair", categories: ["home"], categoryLabel: "Furniture",
    industries: ["furniture", "office chairs", "sofas", "lamps", "clocks"], blurb: "Black and copper, a product slider banner and warm grey cards. For furniture stores", isNew: true, tier: "basic",
    preview: { bg: "#F3F1EE", ink: "#111111", line: "#E3E0DB", accent: "#B86A22", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "tufafi", name: "Tufafi", meaning: "Hausa for clothes", categories: ["fashion", "kids"], categoryLabel: "Family fashion",
    industries: ["family fashion", "menswear", "womenswear", "kids clothing", "accessories"], blurb: "Monochrome, a photo mosaic and the latest for each category. For fashion stores", isNew: true, tier: "premium",
    preview: { bg: "#2A2A2A", ink: "#FFFFFF", line: "#3A3A3A", accent: "#FFFFFF", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "rewa", name: "Rẹ̀wà", meaning: "Yoruba for to be beautiful", categories: ["fashion"], categoryLabel: "Fashion",
    industries: ["fashion", "womenswear", "bags", "dresses", "accessories"], blurb: "Charcoal and hot pink, a promise strip and two big half-width collections. For fashion stores", isNew: true, tier: "premium",
    preview: { bg: "#2B2B2B", ink: "#FFFFFF", line: "#3B3B3B", accent: "#E8074A", nameFont: "grotesk", nameWeight: 800, dark: true },
  }),
  entry({
    id: "igbese", name: "Ìgbésẹ̀", meaning: "Yoruba for step", categories: ["fashion"], categoryLabel: "Shoes",
    industries: ["sneakers", "shoes", "sportswear", "trainers", "streetwear"], blurb: "Orange stripes, a photo mosaic and a deal countdown. For sneaker stores", isNew: true, tier: "basic",
    preview: { bg: "#FFFFFF", ink: "#222222", line: "#F1F1F5", accent: "#FF7A00", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "ola", name: "Ọlá", meaning: "Yoruba for honour and wealth", categories: ["fashion", "jewellery"], categoryLabel: "Fashion",
    industries: ["fashion", "accessories", "watches", "jewellery", "bags"], blurb: "Soft grey and refined, For her and For him photos and new arrivals on photos. For fashion houses", isNew: true, tier: "platinum",
    preview: { bg: "#F4F4F4", ink: "#222222", line: "#E4E4E4", accent: "#C9741C", nameFont: "grotesk", nameWeight: 700, dark: false },
  }),
  entry({
    id: "okunrin", name: "Ọkùnrin", meaning: "Yoruba for man", categories: ["fashion"], categoryLabel: "Menswear",
    industries: ["menswear", "fashion", "shoes", "bags", "accessories"], blurb: "Cream and calm, a model in a circle and staggered collections. For menswear stores", isNew: true, tier: "premium",
    preview: { bg: "#F3F2EE", ink: "#111111", line: "#E6E4DE", accent: "#E53637", nameFont: "grotesk", nameWeight: 800, dark: false },
  }),
  entry({
    id: "salubata", name: "Sálúbàtà", meaning: "Yoruba for sandals and slippers", categories: ["fashion"], categoryLabel: "Shoes",
    industries: ["shoes", "sandals", "slippers", "boots", "heels"], blurb: "Khaki and black, colour-block collections and a deal of the month. For shoe shops", isNew: true, tier: "basic",
    preview: { bg: "#DBCC8F", ink: "#111111", line: "#CDBD7C", accent: "#111111", nameFont: "grotesk", nameWeight: 600, dark: false },
  }),
];

export const THEME_LIBRARY_IDS: readonly ThemeLibraryId[] = THEME_LIBRARY.map((item) => item.id);

export function isLibraryTheme(id: string | null | undefined): id is ThemeLibraryId {
  return typeof id === "string" && (THEME_LIBRARY_IDS as readonly string[]).includes(id);
}

export function themeLibraryEntry(id: string | null | undefined) {
  return THEME_LIBRARY.find((item) => item.id === id) ?? null;
}

/** A theme's tier; themes outside the library (older templates) count as basic. */
export function themeTier(id: string | null | undefined): ThemeTier {
  return themeLibraryEntry(id)?.tier ?? "basic";
}

/** Whether a store on `allowed` may switch to a theme of tier `tier` (basic < premium < platinum). */
export function tierIncludes(allowed: ThemeTier, tier: ThemeTier) {
  return THEME_TIERS.indexOf(tier) <= THEME_TIERS.indexOf(allowed);
}

export function filterThemesByTier(tier: string, themes: readonly ThemeLibraryEntry[] = THEME_LIBRARY) {
  if (!tier || tier === "all") return [...themes];
  return themes.filter((theme) => theme.tier === tier);
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
  { themeId: "oba", industry: "luxury fashion", words: ["couture", "haute couture", "atelier", "maison", "fine jewellery", "fine jewelry", "quiet luxury", "made to order luxury"] },
  { themeId: "gbedu", industry: "audio and streetwear", words: ["audio", "sound system", "dj", "studio monitor", "streetwear", "street wear", "hypebeast", "gaming", "gamer", "esports"] },
  { themeId: "highlife", industry: "lifestyle brand", words: ["lifestyle", "lifestyle brand", "merch", "merchandise", "vintage", "retro", "graphic tee", "bucket hat", "vinyl", "record"] },
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
  // Newer themes: after the industry rules, so on a tie the older, more specific theme still wins.
  { themeId: "zinariya", industry: "fine jewellery", words: ["gold jewellery", "gold jewelry", "diamond", "diamonds", "engagement ring", "wedding band", "18k", "karat", "carat", "goldsmith"] },
  { themeId: "oku", industry: "sport and activewear", words: ["sportswear", "activewear", "gym", "gym wear", "fitness", "jersey", "football", "running", "athleisure", "workout", "training"] },
  { themeId: "ihe", industry: "art and prints", words: ["art", "artwork", "painting", "art print", "poster", "photography", "gallery", "sculpture", "illustration"] },
  { themeId: "zuma", industry: "handmade crafts", words: ["handmade", "hand made", "craft", "crafts", "artisan", "pottery", "ceramic", "woven", "weaving", "basket", "leatherwork", "macrame"] },
  { themeId: "sarauniya", industry: "womenswear", words: ["womenswear", "women's wear", "womens wear", "women's clothing", "occasion wear", "bridal", "bridal wear", "evening wear"] },
  { themeId: "kasuwa", industry: "big catalogue", words: ["department store", "wholesale", "wholesaler", "distributor", "big catalogue", "everything store", "one-stop shop", "one stop shop"] },
  { themeId: "uwa", industry: "editorial lifestyle", words: ["concept store", "magazine", "zine", "curated"] },
  { themeId: "mmiri", industry: "drinks", words: ["juice", "bottled water", "table water", "drinks brand", "beverage brand", "smoothie", "fruit juice", "sachet water"] },
  { themeId: "fitila", industry: "home and lighting", words: ["lighting", "lamp", "lamps", "chandelier", "light fitting", "pendant light", "bulb"] },
  { themeId: "asa", industry: "heritage food and craft", words: ["traditional", "heritage", "local spices", "native", "indigenous", "ogiri", "iru", "dawadawa", "uziza", "ehuru"] },
  { themeId: "irawo", industry: "one-product brand", words: ["single product", "one product", "our product", "flagship product"] },
  { themeId: "rawa", industry: "party wear", words: ["party wear", "clubwear", "club wear", "costume", "festival", "nightlife", "glitter"] },
  { themeId: "shakara", industry: "streetwear drops", words: ["drop", "drops", "limited drop", "hype", "street", "urban wear", "cap", "snapback"] },
  { themeId: "uzo", industry: "travel and outdoor", words: ["travel", "luggage", "outdoor", "camping", "hiking", "adventure", "suitcase"] },
  { themeId: "oso", industry: "fashion label", words: ["fashion label", "ready to wear", "ready-to-wear", "rtw", "label", "collection drop"] },
  { themeId: "aga", industry: "furniture", words: ["chair", "chairs", "table", "dining table", "sofa", "couch", "wardrobe", "bed frame", "furniture maker", "carpentry"] },
  { themeId: "imani", industry: "department store", words: ["department store", "everything for men and women", "men and women", "family fashion", "mall"] },
  { themeId: "itanna", industry: "sneakers", words: ["sneaker store", "sneakerhead", "kicks", "trainers"] },
  { themeId: "gele", industry: "fashion and accessories", words: ["gele", "headtie", "head tie", "headwrap", "head wrap", "turban"] },
  { themeId: "itura", industry: "home and lifestyle", words: ["comfort", "lounge", "lifestyle store", "home goods", "ottoman", "pouf"] },
  { themeId: "igbese", industry: "sneakers", words: ["sneaker plug", "sneaker reseller", "runners club", "basketball gear", "hoops"] },
  { themeId: "salubata", industry: "shoes", words: ["mules", "flip flops", "clogs", "palm slippers"] },
  { themeId: "okunrin", industry: "menswear", words: ["men's fashion store", "male fashion", "men's outfits"] },
  { themeId: "ola", industry: "fashion", words: ["for her and for him", "his and hers", "fashion house"] },
  { themeId: "rewa", industry: "fashion", words: ["fashion trends", "trendy outfits", "designer bags"] },
  { themeId: "osan", industry: "fruit", words: ["fruit basket", "fruit baskets", "fruit vendor", "fruit stand"] },
  { themeId: "ijokoo", industry: "furniture", words: ["showroom", "furniture showroom", "armchair", "dining table"] },
  { themeId: "ite", industry: "interiors", words: ["interior designer", "styling studio", "property staging", "staging"] },
  { themeId: "kujera", industry: "furniture", words: ["workspace", "work from home", "study desk"] },
  { themeId: "tufafi", industry: "family fashion", words: ["men women and kids", "for the whole family", "family clothing"] },
  { themeId: "apere", industry: "groceries", words: ["cold-pressed", "cold pressed", "juice and bakery", "bakery and groceries"] },
  { themeId: "ogba", industry: "fresh produce", words: ["greengrocer", "green grocer", "salad", "herbs and spices shop"] },
  { themeId: "eso", industry: "fruit and vegetables", words: ["veggie box", "veg box", "juicing", "fruit salad"] },
  { themeId: "bata", industry: "shoes", words: ["cobbler", "shoemaker", "shoe maker"] },
  { themeId: "erin", industry: "fashion", words: ["hoodie", "hoodies", "sweatshirt", "pullover", "joggers"] },
  { themeId: "wuta", industry: "electronics", words: ["appliance", "home appliance", "fridge", "freezer", "air conditioner", "generator", "inverter", "television", "blender"] },
  { themeId: "ike", industry: "electronics", words: ["computer village", "computer store", "pc parts", "gaming pc", "monitor", "printer", "computer accessories"] },
  { themeId: "ahia", industry: "general store", words: ["variety store", "general merchandise", "a bit of everything", "multi-category", "online mall"] },
  { themeId: "ewu", industry: "family fashion", words: ["family wear", "family outfits", "matching outfits", "mummy and me", "daddy and me"] },
  { themeId: "ado", industry: "fashion", words: ["urban wear", "smart casual", "streetwear", "street wear", "casual wear"] },
  { themeId: "keke", industry: "bicycles", words: ["bicycle", "bike", "bikes", "cycling", "cyclist", "scooter", "e-bike", "bmx", "keke napep"] },
  { themeId: "itan", industry: "literary books", words: ["literary", "literature", "poetry", "rare book", "first edition", "publisher", "publishing"] },
  { themeId: "littafi", industry: "bookshop", words: ["children's books", "kids books", "storybook", "picture book", "comics bookshop"] },
  { themeId: "omalicha", industry: "wellness", words: ["self-care", "self care", "bath", "body care", "essential oil", "aromatherapy"] },
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
