// Per-person app preferences (User.preferences JSON): menu items switched off in "Customise your menu"
// and the guided walkthrough's progress. Pure helpers, unit-tested.

export interface AppPreferences {
  /** Nav item ids (see src/lib/nav.ts) the person switched off. */
  hiddenNav: string[];
  /** Walkthrough: "done" once finished or skipped; null = never started. */
  tour: "done" | null;
}

export const DEFAULT_PREFERENCES: AppPreferences = { hiddenNav: [], tour: null };

export function parsePreferences(raw: unknown): AppPreferences {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hiddenNav = Array.isArray(value.hiddenNav)
    ? [...new Set(value.hiddenNav.filter((id): id is string => typeof id === "string" && /^[\w-]{1,48}$/.test(id)))].slice(0, 100)
    : [];
  return { hiddenNav, tour: value.tour === "done" ? "done" : null };
}

/** Applies a patch from the client; ids that can't be switched off are ignored by the caller's allow-list. */
export function mergePreferences(current: AppPreferences, patch: Partial<AppPreferences>, allowedNav: Set<string>): AppPreferences {
  const next = { ...current };
  if (patch.hiddenNav) next.hiddenNav = parsePreferences({ hiddenNav: patch.hiddenNav }).hiddenNav.filter((id) => allowedNav.has(id));
  if (patch.tour !== undefined) next.tour = patch.tour === "done" ? "done" : null;
  return next;
}
