import { api, API_URL } from "./api";
import { optional } from "./familiar";
import { filterLooks, type LookFilters } from "./looks-pure";

export { filterLooks, lookFilterCount, NO_LOOK_FILTERS, type LookFilters, type LookTone } from "./looks-pure";

// Shop looks (the web's theme gallery, /builder/templates):
//   GET  /api/mobile/looks                    every theme with its sample photos, plan lock and live demo address
//   POST /api/store/templates/apply           { templateId } switch the shop's draft to it (a live shop keeps its
//                                             look until it publishes), the same route as the web
//   POST /api/store/templates/recommend       Rex picks one for what the shop sells (simple rules without AI)
//   POST /api/store/editor/publish            put the new look live
// A theme's live demo is the public page /theme-demo/<id>, opened in the in-app browser.

export type LookTier = "basic" | "premium" | "platinum";

export interface ShopLook {
  id: string;
  name: string;
  meaning: string;
  blurb: string;
  categories: string[];
  industries: string[];
  tier: LookTier;
  isNew: boolean;
  preview: { bg: string; ink: string; line: string; accent: string; nameFont: "serif" | "sans" | "grotesk"; nameWeight: number; nameItalic?: boolean; dark: boolean };
  demo: { storeName: string; hero: string | null; products: string[] };
  demoPath: string;
  current: boolean;
  /** The plan that includes it when the seller's plan doesn't; never a price. */
  lockedPlan: string | null;
}

export interface LookLibrary {
  looks: ShopLook[];
  chips: string[];
  tiers: LookTier[];
  tier: LookTier;
  currentThemeId: string | null;
  storeSlug: string | null;
}

export const fetchLookLibrary = () => optional(api<LookLibrary>("/api/mobile/looks"));

/** The full address of a theme's live demo (sample store, phone width). */
export const lookDemoUrl = (look: Pick<ShopLook, "demoPath">) => `${API_URL}${look.demoPath}`;

export const applyLook = (templateId: string) =>
  api<{ template: { templateId?: string; templateName?: string } | null; storeSlug: string; draftOnly: boolean }>("/api/store/templates/apply", { method: "POST", json: { templateId } });

export const recommendLook = () => optional(api<{ themeId: string; reason: string; source: "rex" | "rules"; note?: string }>("/api/store/templates/recommend", { method: "POST" }));

export const shownLooks = (library: LookLibrary | null, category: string, filters: LookFilters, pickId: string | null = null) => {
  const looks = filterLooks(library?.looks ?? [], category, filters);
  const pick = pickId ? looks.find((look) => look.id === pickId) : null;
  return pick ? [pick, ...looks.filter((look) => look.id !== pick.id)] : looks;
};
