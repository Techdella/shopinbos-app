// The cookie banner on live store pages (free address and own domain) and what it decides: which of the seller's
// tags (Settings › Connections) may load. Pure (no server or browser imports) so tests/store-traffic.test.mjs runs it.
//
// - The banner shows only when the store has a third-party tag (GA4, Tag Manager, Meta Pixel, TikTok Pixel) and
//   the seller left it on (the default). Verification <meta> tags set nothing and need no consent.
// - Analytics covers Google Analytics and Google Tag Manager; Marketing covers the Meta and TikTok pixels and
//   Google's ad signals. Nothing of either loads before the shopper agrees; Google tags start from Consent Mode
//   v2 with everything denied, then get the shopper's choice (src/components/storefront/StoreConsent.tsx).
// - The choice is kept for 180 days in a first-party cookie and localStorage, then the banner asks again.
// - The store's own traffic counter (StoreTrafficBeacon) sets no cookie and stores nothing about the shopper,
//   so it runs either way; its random visitor token is left out when the shopper says no to analytics.
//
// Shopper-facing words live in COOKIE_BANNER_COPY, one entry per language (storefronts are English today).

import type { StoreIntegrations } from "./integrations.ts";

export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE_DAYS = 180;
export const CONSENT_COOKIE = "sib_consent";
export const consentStorageKey = (slug: string) => `sib-consent:${slug}`;
/** Fired on window to open the banner again ("Cookie settings" in the store footer). */
export const COOKIE_SETTINGS_EVENT = "sib:cookie-settings";
/** A link to "#cookie-settings" anywhere on the store (e.g. one the seller added to a menu) opens the banner too. */
export const COOKIE_SETTINGS_HASH = "#cookie-settings";

export type ConsentCategory = "analytics" | "marketing";

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
  /** When the shopper chose, in seconds since 1970. */
  at: number;
}

/** The cookie / localStorage value: "1.a1m0.1760000000" (version, analytics, marketing, when). */
export function serializeConsent(choice: ConsentChoice): string {
  return `${CONSENT_VERSION}.a${choice.analytics ? 1 : 0}m${choice.marketing ? 1 : 0}.${Math.floor(choice.at)}`;
}

/** A stored choice, or null when there is none, it is malformed, from another version, or older than 180 days. */
export function parseConsent(raw: unknown, nowMs = Date.now()): ConsentChoice | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d+)\.a([01])m([01])\.(\d{9,11})$/.exec(raw.trim());
  if (!match || Number(match[1]) !== CONSENT_VERSION) return null;
  const at = Number(match[4]);
  const ageDays = (nowMs / 1000 - at) / 86_400;
  if (ageDays > CONSENT_MAX_AGE_DAYS || ageDays < -1) return null;
  return { analytics: match[2] === "1", marketing: match[3] === "1", at };
}

/** Reads one cookie out of document.cookie. */
export function readCookie(cookieHeader: string, name: string) {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

/** The Set-Cookie text for a choice: first-party, 180 days, scoped to the store's path on the free address. */
export function consentCookie(choice: ConsentChoice, options: { path?: string; secure?: boolean } = {}) {
  const path = options.path && /^\/[A-Za-z0-9/_-]*$/.test(options.path) ? options.path : "/";
  return `${CONSENT_COOKIE}=${serializeConsent(choice)}; Max-Age=${CONSENT_MAX_AGE_DAYS * 86_400}; Path=${path}; SameSite=Lax${options.secure ? "; Secure" : ""}`;
}

// ─── Which tags need which consent ─────────────────────────────────────────────

export interface TagCategories {
  analytics: string[];
  marketing: string[];
}

/** The store's third-party tools by category (names shoppers recognise). Empty lists: no banner needed. */
export function tagCategories(integrations: Pick<StoreIntegrations, "googleAnalyticsId" | "gtmContainerId" | "metaPixelId" | "tiktokPixelId">): TagCategories {
  const analytics: string[] = [];
  const marketing: string[] = [];
  if (integrations.googleAnalyticsId) analytics.push("Google Analytics");
  if (integrations.gtmContainerId) analytics.push("Google Tag Manager");
  if (integrations.metaPixelId) marketing.push("Meta Pixel");
  if (integrations.tiktokPixelId) marketing.push("TikTok Pixel");
  return { analytics, marketing };
}

export const hasThirdPartyTags = (categories: TagCategories) => categories.analytics.length + categories.marketing.length > 0;

/** Google Consent Mode v2 signals for a choice (all denied before one is made). */
export function googleConsentState(choice: Pick<ConsentChoice, "analytics" | "marketing"> | null) {
  const value = (on: boolean | undefined) => (on ? "granted" : "denied");
  return {
    analytics_storage: value(choice?.analytics),
    ad_storage: value(choice?.marketing),
    ad_user_data: value(choice?.marketing),
    ad_personalization: value(choice?.marketing),
  } as const;
}

/** Inline code that sets Consent Mode v2 to the choice, before any Google tag runs ("default", then "update"). */
export function googleConsentScript(choice: Pick<ConsentChoice, "analytics" | "marketing">) {
  const denied = JSON.stringify(googleConsentState(null));
  const state = JSON.stringify(googleConsentState(choice));
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',${denied});gtag('consent','update',${state});`;
}

// ─── Seller settings (Settings › Connections) ─────────────────────────────────

export const BANNER_MESSAGE_MAX = 240;

export interface CookieBannerSettings {
  /** On unless the seller turned it off. Only shown when the store has third-party tags. */
  enabled: boolean;
  /** The seller's own short line, shown above the buttons ("" = the standard text). Plain text. */
  message: string;
  /** Which policy page to link: "auto" (cookie policy, else privacy policy, when published), "none", or a page key. */
  policy: string;
}

export const DEFAULT_COOKIE_BANNER: CookieBannerSettings = { enabled: true, message: "", policy: "auto" };

/** Plain text only: tags and control characters out, spaces collapsed, at most 240 characters. */
export function cleanBannerMessage(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BANNER_MESSAGE_MAX);
}

function cleanPolicy(raw: unknown) {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "auto" || value === "none" || /^[a-z0-9][a-z0-9-]{0,63}$/.test(value) ? value || "auto" : "auto";
}

/** brandSettings.cookieBanner, cleaned (anything missing reads as the defaults). */
export function readCookieBanner(brandSettings: unknown): CookieBannerSettings {
  const settings = brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {};
  const raw = settings.cookieBanner && typeof settings.cookieBanner === "object" && !Array.isArray(settings.cookieBanner) ? (settings.cookieBanner as Record<string, unknown>) : {};
  return { enabled: raw.enabled !== false, message: cleanBannerMessage(raw.message), policy: cleanPolicy(raw.policy) };
}

/** The Connections form → settings to save. The checkbox is only read when the form had the banner card. */
export function parseCookieBannerForm(get: (name: string) => unknown): CookieBannerSettings | null {
  if (get("cookieBannerForm") !== "1") return null;
  return { enabled: get("cookieBannerEnabled") === "on", message: cleanBannerMessage(get("cookieBannerMessage")), policy: cleanPolicy(get("cookieBannerPolicy")) };
}

/** What the storefront layout hands the banner (built by ./consent-config.ts); no banner without one. */
export interface StoreConsentConfig {
  slug: string;
  categories: TagCategories;
  message: string;
  /** The policy page, as a path inside the store ("/policies/cookie-policy"). */
  policy: { title: string; path: string } | null;
}

// ─── Shopper-facing words ──────────────────────────────────────────────────────

export const COOKIE_BANNER_COPY = {
  en: {
    region: "Cookie choices",
    title: "Cookies on this store",
    body: "We use cookies to understand how our store is used and to measure our ads. Essential ones keep your bag and checkout working. You choose the rest.",
    bodyAnalytics: "We use cookies to understand how our store is used. Essential ones keep your bag and checkout working. You choose the rest.",
    bodyMarketing: "We use cookies to measure and improve our ads. Essential ones keep your bag and checkout working. You choose the rest.",
    acceptAll: "Accept all",
    rejectAll: "Reject non-essential",
    customise: "Customise",
    save: "Save choices",
    close: "Close",
    essential: "Essential",
    essentialHint: "Your bag, checkout and this choice. Always on.",
    alwaysOn: "Always on",
    analytics: "Analytics",
    analyticsHint: "Helps the store see how people use it ({tools}).",
    marketing: "Marketing",
    marketingHint: "Measures and improves the store's ads ({tools}).",
    policy: "Read our {title}",
    settings: "Cookie settings",
    saved: "Your cookie choices are saved.",
  },
} as const;

export type CookieBannerLocale = keyof typeof COOKIE_BANNER_COPY;
export type CookieBannerKey = keyof (typeof COOKIE_BANNER_COPY)["en"];

/** One banner string with its {placeholders} filled, in the store's language (English for now). */
export function bannerText(key: CookieBannerKey, values: Record<string, string> = {}, locale: string = "en") {
  const copy = (COOKIE_BANNER_COPY as Record<string, Record<CookieBannerKey, string>>)[locale] ?? COOKIE_BANNER_COPY.en;
  return (copy[key] ?? COOKIE_BANNER_COPY.en[key]).replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}
