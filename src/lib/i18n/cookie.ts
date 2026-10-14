import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@shared/i18n";

/** Options for the sib_lang cookie: readable by the browser (the picker writes it too), 1 year, Lax. */
export function localeCookieOptions() {
  return { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", httpOnly: false, maxAge: LOCALE_COOKIE_MAX_AGE };
}

export function localeCookie(locale: Locale) {
  return { name: LOCALE_COOKIE, value: locale, ...localeCookieOptions() };
}
