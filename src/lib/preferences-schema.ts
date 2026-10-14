import { z } from "zod";
import { LOCALES, type Locale } from "../../shared/i18n/index.ts";

// PATCH /api/app/preferences body. Its own file (zod only, no path aliases) so tests/learn.test.mjs can load it.
// 60 = MAX_INTROS_SEEN in shared/preferences.ts.
export const PreferencesPatchSchema = z.object({
  hiddenNav: z.array(z.string().max(48)).max(100).optional(),
  tour: z.enum(["done"]).nullable().optional(),
  /** Feature intros just seen; added to the saved list (never replaces it). */
  introsSeen: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(60).optional(),
  /** App language (shared/i18n LOCALES). */
  language: z.enum(LOCALES as [Locale, ...Locale[]]).optional(),
});
