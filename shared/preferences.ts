// Per-person app preferences (User.preferences JSON): menu items switched off in "Customise your menu",
// the guided walkthrough's progress, which 60-second feature intros they've seen and the app language. Pure
// helpers, unit-tested.
import { isLocale, type Locale } from "./i18n/index.ts";

export interface AppPreferences {
  /** Nav item ids (see src/lib/nav.ts) the person switched off. */
  hiddenNav: string[];
  /** Walkthrough: "done" once finished or skipped; null = never started. */
  tour: "done" | null;
  /** Feature intros (shared/feature-intros.ts keys) already shown, newest last. Left out while empty. */
  introsSeen?: string[];
  /** App language (shared/i18n); left out until they pick one (the device's language is used meanwhile). */
  language?: Locale;
}

export const DEFAULT_PREFERENCES: AppPreferences = { hiddenNav: [], tour: null };

/** Intro keys kept per person (oldest dropped first). */
export const MAX_INTROS_SEEN = 60;
const INTRO_KEY = /^[a-z0-9-]{1,40}$/;

function parseIntros(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const keys = raw.filter((key): key is string => typeof key === "string" && INTRO_KEY.test(key));
  // Keep the last copy of each key, so re-marking one moves it to the end.
  return keys.filter((key, index) => keys.lastIndexOf(key) === index).slice(-MAX_INTROS_SEEN);
}

export function parsePreferences(raw: unknown): AppPreferences {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hiddenNav = Array.isArray(value.hiddenNav)
    ? [...new Set(value.hiddenNav.filter((id): id is string => typeof id === "string" && /^[\w-]{1,48}$/.test(id)))].slice(0, 100)
    : [];
  const introsSeen = parseIntros(value.introsSeen);
  return {
    hiddenNav,
    tour: value.tour === "done" ? "done" : null,
    ...(introsSeen.length ? { introsSeen } : {}),
    ...(isLocale(value.language) ? { language: value.language } : {}),
  };
}

/**
 * Applies a patch from the client; ids that can't be switched off are ignored by the caller's allow-list.
 * `introsSeen` only ever adds (two tabs marking different intros can't undo each other).
 */
export function mergePreferences(current: AppPreferences, patch: Partial<AppPreferences>, allowedNav: Set<string>): AppPreferences {
  const next = { ...current };
  if (patch.hiddenNav) next.hiddenNav = parsePreferences({ hiddenNav: patch.hiddenNav }).hiddenNav.filter((id) => allowedNav.has(id));
  if (patch.tour !== undefined) next.tour = patch.tour === "done" ? "done" : null;
  if (patch.introsSeen) {
    const merged = parseIntros([...(current.introsSeen ?? []).filter((key) => !patch.introsSeen!.includes(key)), ...patch.introsSeen]);
    if (merged.length) next.introsSeen = merged;
  }
  if (isLocale(patch.language)) next.language = patch.language;
  return next;
}
