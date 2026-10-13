"use client";

import { createContext, use, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createT, isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale, type TFunction } from "@shared/i18n";
import type { KeysOf, Namespace } from "@shared/i18n/catalog";
import { catalogsFromMerged, mergeLocale, type MergedMessages } from "@shared/i18n/merged";
import { MESSAGE_LOADERS } from "./loaders.generated";

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

// ── Words a page needs that the server didn't send ─────────────────────────────
// The root layout sends only the namespaces the first page uses (src/lib/i18n/routes.ts). After a client-side
// navigation a component may need another one: it is fetched as its own small chunk (English + the language) and
// the component suspends until it arrives. Navigations are transitions, so the old page stays on screen meanwhile.

type Loaded = Record<string, string>;
type Tracked = Promise<Loaded> & { status?: "pending" | "fulfilled" | "rejected"; value?: Loaded };
const LOADS = new Map<string, Tracked>();

function loadNamespace(locale: Locale, namespace: string): Tracked {
  const key = `${locale}:${namespace}`;
  const existing = LOADS.get(key);
  if (existing) return existing;
  const loaders = MESSAGE_LOADERS[namespace];
  const load = async (): Promise<Loaded> => {
    if (!loaders?.en) return {};
    const [en, own] = await Promise.all([loaders.en(), locale === "en" || !loaders[locale] ? null : loaders[locale]!()]);
    return mergeLocale(en.default, own?.default);
  };
  const promise = load() as Tracked;
  promise.status = "pending";
  promise.then(
    (value) => {
      promise.status = "fulfilled";
      promise.value = value;
    },
    () => {
      promise.status = "rejected";
      // Let a later render try again (e.g. after a dropped connection).
      LOADS.delete(key);
    },
  );
  LOADS.set(key, promise);
  return promise;
}

function loadedSync(locale: Locale, namespace: string): Loaded | undefined {
  const tracked = LOADS.get(`${locale}:${namespace}`);
  return tracked?.status === "fulfilled" ? tracked.value : undefined;
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
  let extra: MergedMessages | null = null;
  if (state) {
    for (const namespace of namespaces) {
      if (messages?.[namespace]) continue;
      const ready = loadedSync(locale, namespace);
      // Suspends until the chunk is in (rejected loads throw to the nearest error boundary, which can retry).
      (extra ??= {})[namespace] = ready ?? use(loadNamespace(locale, namespace) as Promise<Loaded>);
    }
  }
  const extraKey = extra ? Object.keys(extra).join("|") : "";
  return useMemo(
    () => createT<KeysOf<NS>>(locale, catalogsFromMerged({ ...(messages ?? {}), ...(extra ?? {}) }, namespaces)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, messages, key, extraKey],
  );
}
