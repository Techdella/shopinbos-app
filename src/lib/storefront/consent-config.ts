// What the storefront layout hands the cookie banner (src/components/storefront/StoreConsent.tsx): the store's tag
// categories, the seller's message and the policy page to link. Kept apart from ./consent.ts so the banner's browser
// code doesn't carry the legal-page helpers. Pure, tested in tests/store-traffic.test.mjs.

import { legalLinks } from "../legal/pages.ts";
import type { StoreIntegrations } from "./integrations.ts";
import { hasThirdPartyTags, readCookieBanner, tagCategories, type CookieBannerSettings, type StoreConsentConfig } from "./consent.ts";

/** The policy page the banner links to, from the store's published legal pages (works on public settings). */
export function bannerPolicyLink(settings: CookieBannerSettings, brandSettings: unknown): { key: string; title: string } | null {
  if (settings.policy === "none") return null;
  const links = legalLinks(brandSettings);
  if (settings.policy !== "auto") {
    const chosen = links.find((link) => link.key === settings.policy);
    if (chosen) return chosen;
  }
  return links.find((link) => link.key === "cookie-policy") ?? links.find((link) => link.key === "privacy-policy") ?? null;
}

/** The banner for a live store page, or null when none is shown (no third-party tags, or the seller turned it off). */
export function storeConsentConfig(slug: string, integrations: StoreIntegrations, brandSettings: unknown): StoreConsentConfig | null {
  const categories = tagCategories(integrations);
  const settings = readCookieBanner(brandSettings);
  if (!hasThirdPartyTags(categories) || !settings.enabled) return null;
  const link = bannerPolicyLink(settings, brandSettings);
  return { slug, categories, message: settings.message, policy: link ? { title: link.title, path: `/policies/${link.key}` } : null };
}
