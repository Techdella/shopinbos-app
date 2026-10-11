// The 2026 theme library: the eight storefront themes the seller picks from on /builder/templates and in the
// builder's Themes view. Pure data and helpers (no imports with side effects), so tests can load it directly.

import type { StoreEditorSnapshot, TemplatePageSeed, TemplateSectionNode } from "./types";

export type ThemeLibraryId = "breeze" | "noir" | "plain" | "adire" | "pantry" | "ile" | "plug" | "stride";
export type ThemeLibraryCategory = "fashion" | "shoes" | "luxury" | "food" | "home" | "gadgets" | "any";

export interface ThemeLibraryPreview {
  /** Card background, text and hairline colours for the mini preview. */
  bg: string;
  ink: string;
  line: string;
  accent: string;
  /** How the theme name is set on its card, in the theme's own type. */
  nameFont: "serif" | "sans" | "grotesk";
  nameWeight: number;
  nameItalic?: boolean;
  dark: boolean;
}

export interface ThemeLibraryEntry {
  id: ThemeLibraryId;
  name: string;
  category: ThemeLibraryCategory;
  categoryLabel: string;
  blurb: string;
  isNew: boolean;
  preview: ThemeLibraryPreview;
}

export const THEME_LIBRARY: readonly ThemeLibraryEntry[] = [
  {
    id: "breeze",
    name: "Breeze",
    category: "fashion",
    categoryLabel: "Fashion",
    blurb: "Airy and clean, big product pages. For fashion",
    isNew: true,
    preview: { bg: "#E8F6F7", ink: "#1A1D21", line: "#C9DFE1", accent: "#1FC6D6", nameFont: "grotesk", nameWeight: 400, dark: false },
  },
  {
    id: "noir",
    name: "Noir",
    category: "luxury",
    categoryLabel: "Luxury",
    blurb: "Dark and premium, with countdowns. For luxury",
    isNew: true,
    preview: { bg: "#141414", ink: "#F5F2EA", line: "#3A3936", accent: "#C8A96A", nameFont: "serif", nameWeight: 600, dark: true },
  },
  {
    id: "plain",
    name: "Plain",
    category: "any",
    categoryLabel: "Any shop",
    blurb: "Simple and fast. Works for anything",
    isNew: true,
    preview: { bg: "#F2F2F2", ink: "#111111", line: "#DADADA", accent: "#111111", nameFont: "grotesk", nameWeight: 400, dark: false },
  },
  {
    id: "adire",
    name: "Adire",
    category: "fashion",
    categoryLabel: "Fashion",
    blurb: "Editorial, photo-led. For fashion",
    isNew: false,
    preview: { bg: "#F3ECE5", ink: "#2B1D14", line: "#DDCFC1", accent: "#B8612F", nameFont: "serif", nameWeight: 400, dark: false },
  },
  {
    id: "pantry",
    name: "Pantry",
    category: "food",
    categoryLabel: "Food and drinks",
    blurb: "Warm and bold. For food and drinks",
    isNew: false,
    preview: { bg: "#FFF2D8", ink: "#3A1E0B", line: "#EBD7AE", accent: "#E2541B", nameFont: "sans", nameWeight: 800, dark: false },
  },
  {
    id: "ile",
    name: "Ilé",
    category: "home",
    categoryLabel: "Home and living",
    blurb: "Calm and roomy. For home and decor",
    isNew: false,
    preview: { bg: "#E6EDE8", ink: "#1F2A24", line: "#CBD6CE", accent: "#5E7464", nameFont: "serif", nameWeight: 700, dark: false },
  },
  {
    id: "plug",
    name: "Plug",
    category: "gadgets",
    categoryLabel: "Gadgets",
    blurb: "Dark and sharp. For gadgets",
    isNew: false,
    preview: { bg: "#17181D", ink: "#F2F4F7", line: "#33363F", accent: "#5B8CFF", nameFont: "grotesk", nameWeight: 500, dark: true },
  },
  {
    id: "stride",
    name: "Stride",
    category: "shoes",
    categoryLabel: "Shoes",
    blurb: "Loud and sporty. For shoes",
    isNew: false,
    preview: { bg: "#FDE6DA", ink: "#141414", line: "#F0C9B5", accent: "#FF4D1F", nameFont: "sans", nameWeight: 800, dark: false },
  },
];

export const THEME_LIBRARY_IDS: readonly ThemeLibraryId[] = THEME_LIBRARY.map((entry) => entry.id);

export function isLibraryTheme(id: string | null | undefined): id is ThemeLibraryId {
  return typeof id === "string" && (THEME_LIBRARY_IDS as readonly string[]).includes(id);
}

export function themeLibraryEntry(id: string | null | undefined) {
  return THEME_LIBRARY.find((entry) => entry.id === id) ?? null;
}

// ─── Category chips ─────────────────────────────────────────────────────────

export type ThemeChipId = "all" | Exclude<ThemeLibraryCategory, "any">;

export const THEME_CATEGORY_CHIPS: ReadonlyArray<{ id: ThemeChipId; label: string }> = [
  { id: "all", label: "All" },
  { id: "fashion", label: "Fashion" },
  { id: "shoes", label: "Shoes" },
  { id: "luxury", label: "Luxury" },
  { id: "food", label: "Food" },
  { id: "home", label: "Home" },
  { id: "gadgets", label: "Gadgets" },
];

/** "All" plus only the chips that have at least one theme. */
export function themeCategoryChips(themes: readonly ThemeLibraryEntry[] = THEME_LIBRARY) {
  return THEME_CATEGORY_CHIPS.filter((chip) => chip.id === "all" || themes.some((theme) => theme.category === chip.id));
}

export function filterThemes(category: string, themes: readonly ThemeLibraryEntry[] = THEME_LIBRARY) {
  if (!category || category === "all") return [...themes];
  return themes.filter((theme) => theme.category === category);
}

// ─── Rule-based pick (used when no AI key is set, and to check what Rex says) ─

const CATEGORY_WORDS: Array<{ category: Exclude<ThemeLibraryCategory, "any">; words: string[] }> = [
  { category: "shoes", words: ["shoe", "sneaker", "trainer", "footwear", "heel", "sandal", "slipper", "boot", "loafer", "slide"] },
  { category: "luxury", words: ["luxury", "jewel", "jewellery", "jewelry", "gold", "watch", "perfume", "fragrance", "designer", "premium", "diamond"] },
  { category: "food", words: ["food", "drink", "snack", "grocer", "juice", "spice", "bakery", "cake", "pastry", "restaurant", "zobo", "wine", "coffee", "tea", "kitchen", "chops", "meal", "soup"] },
  { category: "home", words: ["home", "decor", "furniture", "living", "candle", "bedding", "interior", "homeware", "rug", "cushion", "vase", "lamp"] },
  { category: "gadgets", words: ["gadget", "phone", "electronic", "tech", "laptop", "charger", "earbud", "headphone", "speaker", "power bank", "smartwatch", "console", "camera"] },
  { category: "fashion", words: ["fashion", "cloth", "wear", "dress", "ankara", "adire", "fabric", "bag", "tailor", "shirt", "apparel", "boutique", "kaftan", "agbada", "aso", "beauty", "skincare", "hair"] },
];

const THEME_FOR_CATEGORY: Record<Exclude<ThemeLibraryCategory, "any">, ThemeLibraryId> = {
  fashion: "breeze",
  shoes: "stride",
  luxury: "noir",
  food: "pantry",
  home: "ile",
  gadgets: "plug",
};

const EDITORIAL_WORDS = ["adire", "ankara", "aso", "tailor", "fabric", "kaftan", "agbada", "linen"];

export interface ThemePickInput {
  /** What the seller said they sell during onboarding (free text). */
  storeCategory?: string | null;
  productNames?: string[];
  productCategories?: string[];
  currentThemeId?: string | null;
}

export interface ThemePick {
  themeId: ThemeLibraryId;
  category: Exclude<ThemeLibraryCategory, "any"> | null;
  reason: string;
}

function countMatches(text: string, words: string[]) {
  return words.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
}

export function pickThemeByRules(input: ThemePickInput): ThemePick {
  const stated = (input.storeCategory ?? "").toLowerCase();
  const catalog = [...(input.productNames ?? []), ...(input.productCategories ?? [])].join(" · ").toLowerCase();
  let best: { category: Exclude<ThemeLibraryCategory, "any">; score: number } | null = null;
  for (const { category, words } of CATEGORY_WORDS) {
    const score = countMatches(stated, words) * 3 + countMatches(catalog, words);
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  if (!best) {
    return { themeId: "plain", category: null, reason: "I couldn't tell what you sell yet, so Plain is the safe pick: simple, fast and it works for any shop." };
  }
  let themeId = THEME_FOR_CATEGORY[best.category];
  if (best.category === "fashion" && countMatches(`${stated} ${catalog}`, EDITORIAL_WORDS) > 0) themeId = "adire";
  const entry = themeLibraryEntry(themeId)!;
  const label = THEME_CATEGORY_CHIPS.find((chip) => chip.id === best!.category)?.label.toLowerCase() ?? best.category;
  return { themeId, category: best.category, reason: `Your shop looks like ${label}, so ${entry.name} fits: ${entry.blurb.split(". For")[0].toLowerCase()}.` };
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
