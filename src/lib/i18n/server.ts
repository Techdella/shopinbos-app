import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "@shared/i18n";
import { mergedMessages, tFor, type KeysOf, type MergedMessages, type Namespace } from "@shared/i18n/catalog";
import { parsePreferences } from "@shared/preferences";
import type { TFunction } from "@shared/i18n";

// The language for server components and route handlers: the sib_lang cookie (set by the language picker, and
// from the person's saved preference when they sign in on a new device), else the browser's Accept-Language.
// Signed-in people's saved preference reaches the cookie through the I18nProvider (one GET /api/app/preferences
// when there's no cookie yet), so pages never hit the database just to pick a language.

export type LocaleSource = "cookie" | "header";

export const getLocaleInfo = cache(async (): Promise<{ locale: Locale; source: LocaleSource }> => {
  try {
    const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(cookie)) return { locale: cookie, source: "cookie" };
  } catch {
    // Outside a request (build, scripts): fall through.
  }
  try {
    return { locale: negotiateLocale((await headers()).get("accept-language")), source: "header" };
  } catch {
    return { locale: DEFAULT_LOCALE, source: "header" };
  }
});

export async function getLocale(): Promise<Locale> {
  return (await getLocaleInfo()).locale;
}

/** `const t = await getT("nav", "common")` in a server component or route handler. */
export async function getT<const NS extends readonly Namespace[]>(...namespaces: NS): Promise<TFunction<KeysOf<NS>>> {
  return tFor(await getLocale(), ...namespaces);
}

/** The current language's messages (English filling gaps) for the client provider. */
export async function getClientMessages(): Promise<MergedMessages> {
  return mergedMessages(await getLocale());
}

// ── Emails and other messages sent to one person ──────────────────────────────
// Emails render outside the recipient's browser, so the language comes from their saved preference. Phase 2 can
// translate the email shell with: `const t = tFor(localeForUser(user), "emails")`.

/** A user's language from their saved preferences (User.preferences JSON), else English. */
export function localeForUser(user: { preferences?: unknown } | null | undefined): Locale {
  return parsePreferences(user?.preferences).language ?? DEFAULT_LOCALE;
}

/** A translate function in a given language (emails, push messages, anything not tied to the current request). */
export function getTFor<const NS extends readonly Namespace[]>(locale: Locale, ...namespaces: NS): TFunction<KeysOf<NS>> {
  return tFor(locale, ...namespaces);
}
