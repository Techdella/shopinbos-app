"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createT, isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale, type TFunction } from "@shared/i18n";
import { catalogsFromMerged, type KeysOf, type MergedMessages, type Namespace } from "@shared/i18n/catalog";

// App-wide language on the web. Mounted once in the root layout with the locale the server picked (cookie, else
// Accept-Language) and that language's messages (English filling gaps), so the first paint is already translated.
//   const t = useT("nav", "common");   t("orders")   t("count.orders", { count: 3 })
//   const locale = useLocale();
//   const setLocale = useSetLocale();   await setLocale("yo")  // cookie + saved preference + server refresh
// See shared/i18n/README.md.

interface I18nState {
  locale: Locale;
  messages: MergedMessages;
  setLocale: (locale: Locale) => Promise<void>;
  changing: boolean;
}

const I18nContext = createContext<I18nState | null>(null);

function writeCookie(locale: Locale) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    // Cookies blocked: the choice still applies to this page and the saved preference.
  }
}

function readCookie(): string | null {
  try {
    return document.cookie.split("; ").find((part) => part.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1) ?? null;
  } catch {
    return null;
  }
}

/** Supabase keeps the session in sb-…-auth-token cookies; a cheap "probably signed in" check. */
function looksSignedIn() {
  try {
    return /(?:^|; )sb-[^=]+-auth-token/.test(document.cookie);
  } catch {
    return false;
  }
}

const SYNC_KEY = "sib_lang_synced";

export function I18nProvider({ locale: serverLocale, messages, children }: { locale: Locale; messages: MergedMessages; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(serverLocale);
  const [changing, setChanging] = useState(false);

  // A server refresh brings the new language's messages; keep the locale in step with them.
  useEffect(() => {
    setLocaleState(serverLocale);
    setChanging(false);
    document.documentElement.lang = serverLocale;
  }, [serverLocale]);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (!isLocale(next)) return;
      writeCookie(next);
      setLocaleState(next);
      document.documentElement.lang = next;
      if (next !== serverLocale) setChanging(true);
      // Saved on the account so the phone app and other devices follow. Signed out (401): the cookie is enough.
      await fetch("/api/app/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ language: next }),
      }).catch(() => null);
      router.refresh();
    },
    [router, serverLocale],
  );

  // New device or cleared cookies while signed in: adopt the saved language once per tab.
  useEffect(() => {
    if (readCookie() || !looksSignedIn()) return;
    try {
      if (sessionStorage.getItem(SYNC_KEY)) return;
      sessionStorage.setItem(SYNC_KEY, "1");
    } catch {
      // No storage: try anyway (at most once per page load).
    }
    let stopped = false;
    fetch("/api/app/preferences", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { language?: unknown } } | null) => {
        const saved = body?.data?.language;
        if (stopped || !isLocale(saved)) return;
        writeCookie(saved);
        if (saved !== serverLocale) router.refresh();
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, [router, serverLocale]);

  const value = useMemo(() => ({ locale, messages, setLocale, changing }), [locale, messages, setLocale, changing]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n() {
  return useContext(I18nContext);
}

export function useLocale(): Locale {
  return useI18n()?.locale ?? "en";
}

export function useSetLocale() {
  const state = useI18n();
  return state?.setLocale ?? (async () => undefined);
}

/** True between choosing a language and the server sending its words. */
export function useLocaleChanging() {
  return useI18n()?.changing ?? false;
}

/**
 * A translate function for one or more namespaces. Outside the provider (tests, isolated renders) it shows the
 * fallback text given to t.dynamic, else the key.
 */
export function useT<const NS extends readonly Namespace[]>(...namespaces: NS): TFunction<KeysOf<NS>> {
  const state = useI18n();
  const key = namespaces.join("|");
  const messages = state?.messages;
  // The server's messages are for the server's locale; while a change is in flight keep using them.
  const locale = state?.locale ?? "en";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => createT<KeysOf<NS>>(locale, catalogsFromMerged(messages ?? {}, namespaces)), [locale, messages, key]);
}
