// Shop looks for the phone app (GET /api/mobile/looks): the same 2026 theme library the web's /builder/templates
// shows, each with its sample store's real photos (a banner and two products, the pictures the web's live preview
// uses), whether the seller's plan includes it, and the address of its live demo (/theme-demo/<id>). The app never
// sells a theme or a plan: a locked look only names the plan that includes it. Relative imports only, so
// tests/mobile-looks.test.mjs loads this file directly.

import { DEMO_PHOTOS, unsplashUrl } from "./demo-photos.ts";
import { demoCatalogueFor } from "./demo-catalogue.ts";
import { THEME_LIBRARY, THEME_TIERS, themeCategoryChips, tierIncludes, type ThemeLibraryPreview, type ThemeTier } from "./theme-library.ts";
import { themeTierPlanName } from "../../../shared/plans.ts";

export interface MobileLook {
  id: string;
  name: string;
  /** What the name means ("Yoruba for breeze"); the app shows the translated `theme.<id>.meaning` when it has one. */
  meaning: string;
  blurb: string;
  categories: string[];
  industries: string[];
  tier: ThemeTier;
  isNew: boolean;
  preview: ThemeLibraryPreview;
  /** The sample store in the theme's live preview: its name, banner photo and two product photos. */
  demo: { storeName: string; hero: string | null; products: string[] };
  /** Path of the theme's live demo on the web app (public, a phone-width storefront with sample products). */
  demoPath: string;
  current: boolean;
  /** The plan that includes it, when the seller's plan doesn't (and they haven't bought it). */
  lockedPlan: string | null;
}

export interface MobileLooks {
  looks: MobileLook[];
  /** Category chips, "all" first (the web gallery's chips). */
  chips: string[];
  tiers: ThemeTier[];
  /** The highest tier the seller's plan includes. */
  tier: ThemeTier;
  currentThemeId: string | null;
  storeSlug: string | null;
}

export const themeDemoPath = (id: string) => `/theme-demo/${encodeURIComponent(id)}`;

export function mobileLooks(access: { tier: ThemeTier; owned: readonly string[] }, currentThemeId: string | null, storeSlug: string | null = null): MobileLooks {
  const looks = THEME_LIBRARY.map((theme): MobileLook => {
    const photos = DEMO_PHOTOS[theme.id];
    const current = theme.id === currentThemeId;
    const usable = current || tierIncludes(access.tier, theme.tier) || access.owned.includes(theme.id);
    return {
      id: theme.id,
      name: theme.name,
      meaning: theme.meaning,
      blurb: theme.blurb,
      categories: [...theme.categories],
      industries: [...theme.industries],
      tier: theme.tier,
      isNew: theme.isNew,
      preview: theme.preview,
      demo: {
        storeName: demoCatalogueFor(theme.id).storeName,
        hero: photos ? unsplashUrl(photos.hero, 900, 640) : null,
        products: photos ? photos.products.slice(0, 2).map((id) => unsplashUrl(id, 480, 600)) : [],
      },
      demoPath: themeDemoPath(theme.id),
      current,
      lockedPlan: usable ? null : themeTierPlanName(theme.tier),
    };
  });
  return {
    looks,
    chips: themeCategoryChips(THEME_LIBRARY).map((chip) => chip.id),
    tiers: [...THEME_TIERS],
    tier: access.tier,
    currentThemeId,
    storeSlug,
  };
}
