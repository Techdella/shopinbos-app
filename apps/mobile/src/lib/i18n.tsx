import "expo-sqlite/localStorage/install";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { isLocale, negotiateLocale, type Locale, type TFunction } from "@shared/i18n";
import { tFor, type KeysOf, type Namespace } from "@shared/i18n/catalog";
import { parsePreferences } from "@shared/preferences";
import { api } from "./api";
import { setAppLocale } from "./app-locale";
import { useSession } from "./session";

// App-wide language on the phone (same catalogs as the web, shared/i18n). Mounted in app/_layout.tsx.
//   const t = useT("nav", "common");   t("tab.home")
//   const locale = useLocale();   const setLocale = useSetLocale();
// The choice is kept on the phone (localStorage via expo-sqlite, like the other small prefs) and, when signed in,
// in the account's preferences (GET/PATCH /api/app/preferences), so the web app and other phones follow.
// Before anyone chooses, the phone's own language decides (English when it isn't one we speak).

const KEY = "shopinbos.lang";
/** The Riders app's old language key (apps/mobile/src/lib/rider-strings.ts), carried over once. */
const RIDER_KEY = "shopinbos.rider.lang";

function deviceLocales(): string[] {
  const out: string[] = [];
  try {
    if (Platform.OS === "web" && typeof navigator !== "undefined") out.push(...(navigator.languages ?? [navigator.language]));
  } catch {
    // ignore
  }
  try {
    out.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // Intl without locale data: English.
  }
  return out;
}

/** The saved choice on this phone, or null when nobody has picked one here. */
export function savedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(KEY) ?? localStorage.getItem(RIDER_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    // No storage: the choice lasts until the app closes.
  }
}

/** The language to start with: this phone's saved choice, else the phone's language. */
export function initialLocale(): Locale {
  return savedLocale() ?? negotiateLocale(deviceLocales());
}

interface I18nState {
  locale: Locale;
  /** Saves the choice on the phone at once; resolves false when it couldn't be saved to the account (offline). */
  setLocale: (locale: Locale) => Promise<boolean>;
}

const I18nContext = createContext<I18nState>({ locale: "en", setLocale: async () => true });

export function I18nProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const localeRef = useRef(locale);
  // Code outside React (API error lines, lib alerts) reads the language from lib/app-locale.
  setAppLocale(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  const uid = session?.user.id ?? null;

  // Signed in: the account's saved language wins; if it has none yet, it takes the one chosen on this phone.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void api<unknown>("/api/app/preferences")
      .then((raw) => {
        if (!alive) return;
        const saved = parsePreferences(raw).language;
        if (saved) {
          saveLocale(saved);
          setLocaleState(saved);
        } else if (savedLocale()) {
          void api("/api/app/preferences", { method: "PATCH", json: { language: localeRef.current } }).catch(() => null);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [uid]);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (!isLocale(next)) return true;
      saveLocale(next);
      setLocaleState(next);
      if (!uid) return true;
      try {
        await api("/api/app/preferences", { method: "PATCH", json: { language: next } });
        return true;
      } catch {
        return false;
      }
    },
    [uid],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export function useSetLocale() {
  return useContext(I18nContext).setLocale;
}

/** A translate function for one or more namespaces in the app language (English for anything not translated). */
export function useT<const NS extends readonly Namespace[]>(...namespaces: NS): TFunction<KeysOf<NS>> {
  const locale = useLocale();
  const key = namespaces.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => tFor(locale, ...namespaces), [locale, key]);
}
