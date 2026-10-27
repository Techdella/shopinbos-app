// The app's own cookie choice (Shopinbos's portals and marketing pages on the app host, never a seller's storefront,
// which has its own banner, components/storefront/StoreConsent.tsx). Under the NDPA and the NDPC's GAID 2025, only
// what the app needs to work (sign-in, security, language) runs without asking; product analytics (Google Analytics,
// Mixpanel, PostHog) and Sentry's session replay wait for "Allow analytics" and stop when it's taken back.
// Kept in this browser's storage: choices are per device, like the cookies they're about.

export type ConsentChoice = "analytics" | "essential";

const KEY = "shopinbos:consent:v1";
export const CONSENT_EVENT = "shopinbos:consent";
export const CONSENT_OPEN_EVENT = "shopinbos:consent-open";

export function readConsent(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "analytics" || value === "essential" ? value : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_EVENT, { detail: choice }));
}

/** Opens the banner again (the "Cookie settings" links). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
