import type { Locale, TFunction } from "@shared/i18n";
import { tFor, type KeysOf, type Namespace } from "@shared/i18n/catalog";

// The app language for code outside React (API error lines, alerts from lib helpers). lib/i18n.tsx keeps it in
// step with the language the person chose; screens use useT() instead.

let current: Locale = "en";

export function setAppLocale(locale: Locale) {
  current = locale;
}

export function appLocale(): Locale {
  return current;
}

/** A translate function in the current app language, for one call (don't keep it: the language can change). */
export function tNow<const NS extends readonly Namespace[]>(...namespaces: NS): TFunction<KeysOf<NS>> {
  return tFor(current, ...namespaces);
}
