// What a store keeps about outside tools, in brandSettings.integrations: only the Google Search Console
// verification code "Connect Google" saves for the seller (src/lib/google/connect.server.ts), so Google can verify
// the store and list it in search. Stores load no tracking tags (no Google Analytics, Tag Manager, Meta or TikTok
// pixels) and show no other verification codes; IDs saved by older versions are ignored. Pure (no server imports)
// so tests can run it.
//
// The code is re-validated on the way OUT as well as on save, so a value edited in the database still can't put
// anything but a clean token into a <meta> tag.

import { googleSiteVerification } from "../security/html.ts";

export interface StoreIntegrations {
  /** Google Search Console HTML tag code (stored as gaSiteVerification, its original key). */
  gaSiteVerification: string;
}

export type IntegrationKey = keyof StoreIntegrations;

export const INTEGRATION_VALIDATORS: Record<IntegrationKey, (value: unknown) => string> = {
  gaSiteVerification: googleSiteVerification,
};

export const EMPTY_INTEGRATIONS: StoreIntegrations = { gaSiteVerification: "" };

/** The validated connections from brandSettings (anything malformed reads as not set). */
export function readIntegrations(brandSettings: unknown): StoreIntegrations {
  const settings = brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {};
  const raw = settings.integrations && typeof settings.integrations === "object" && !Array.isArray(settings.integrations) ? (settings.integrations as Record<string, unknown>) : {};
  return { gaSiteVerification: googleSiteVerification(raw.gaSiteVerification) };
}

/** Next.js metadata for the Google verification <meta> tag on the store home page (free address and own domain). */
export function storeVerificationMetadata(integrations: StoreIntegrations): { verification?: { google: string } } {
  return integrations.gaSiteVerification ? { verification: { google: integrations.gaSiteVerification } } : {};
}

/** Whether a request path is the owner's preview of the store (never counted). */
export function isPreviewPath(path: string | null | undefined) {
  return /(^|\/)preview(\/|$|\?)/.test(path ?? "");
}

/** The store's sitemap address to submit to Google and Bing (served at the store root). */
export function sitemapUrl(storeUrl: string) {
  return `${storeUrl.replace(/\/+$/, "")}/sitemap.xml`;
}
