// Shop looks filters (the web gallery's category chips, plan tiers and search, plus light or dark), with no imports
// so tests/mobile-looks.test.mjs can run them in Node.

export type LookTone = "all" | "light" | "dark";

export interface LookFilters {
  /** Words to find in the name, its meaning, what it suits and the industries it's built for. */
  q: string;
  /** "all" or a tier: basic (Free), premium, platinum. */
  tier: string;
  tone: LookTone;
  /** Only looks the seller's plan includes (or they already have). */
  usable: boolean;
  /** Only the new ones. */
  isNew: boolean;
}

export const NO_LOOK_FILTERS: LookFilters = { q: "", tier: "all", tone: "all", usable: false, isNew: false };

interface FilterableLook {
  name: string;
  meaning: string;
  blurb: string;
  categories: string[];
  industries: string[];
  tier: string;
  isNew: boolean;
  preview: { dark: boolean };
  lockedPlan: string | null;
}

/** Lower case without accents or tone marks: "Ẹwà" → "ewa". */
export const fold = (value: string) => value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();

/** How many filters in the sheet are picked (the category chip row is counted apart). */
export function lookFilterCount(filters: LookFilters) {
  return (filters.q.trim() ? 1 : 0) + (filters.tier !== "all" ? 1 : 0) + (filters.tone !== "all" ? 1 : 0) + (filters.usable ? 1 : 0) + (filters.isNew ? 1 : 0);
}

export function filterLooks<L extends FilterableLook>(looks: readonly L[], category: string, filters: LookFilters): L[] {
  const words = fold(filters.q).split(/[\s,]+/).filter(Boolean);
  return looks.filter((look) => {
    if (category && category !== "all" && !look.categories.includes(category)) return false;
    if (filters.tier !== "all" && look.tier !== filters.tier) return false;
    if (filters.tone === "dark" && !look.preview.dark) return false;
    if (filters.tone === "light" && look.preview.dark) return false;
    if (filters.usable && look.lockedPlan) return false;
    if (filters.isNew && !look.isNew) return false;
    if (!words.length) return true;
    const haystack = fold([look.name, look.meaning, look.blurb, ...look.categories, ...look.industries].join(" "));
    return words.every((word) => haystack.includes(word));
  });
}
