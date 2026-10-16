// The shopper's cookie choice in the browser: a first-party cookie (sib_consent, 180 days, the store's path on
// the free address) plus a localStorage copy, so a cleared cookie or a blocked storage still remembers it.
// Read by the banner (src/components/storefront/StoreConsent.tsx) and the traffic beacon.

import { CONSENT_COOKIE, consentCookie, consentStorageKey, parseConsent, readCookie, serializeConsent, type ConsentChoice } from "./consent";

function local() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The shopper's saved choice for this store, or null (never chose, or it is older than 180 days). */
export function readStoredConsent(slug: string): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  let fromCookie: ConsentChoice | null = null;
  try {
    fromCookie = parseConsent(readCookie(document.cookie, CONSENT_COOKIE));
  } catch {
    fromCookie = null;
  }
  let fromStorage: ConsentChoice | null = null;
  try {
    fromStorage = parseConsent(local()?.getItem(consentStorageKey(slug)) ?? null);
  } catch {
    fromStorage = null;
  }
  // The newer of the two, in case one of them was cleared and set again.
  if (fromCookie && fromStorage) return fromCookie.at >= fromStorage.at ? fromCookie : fromStorage;
  return fromCookie ?? fromStorage;
}

export function saveConsent(slug: string, choice: ConsentChoice, basePath: string) {
  try {
    document.cookie = consentCookie(choice, { path: basePath || "/", secure: window.location.protocol === "https:" });
  } catch {
    // Cookies blocked: localStorage below still remembers.
  }
  try {
    local()?.setItem(consentStorageKey(slug), serializeConsent(choice));
  } catch {
    // Storage blocked too: the banner asks again next visit.
  }
}
