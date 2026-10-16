// A store's connections to outside tools (Settings › Connections), stored in brandSettings.integrations: Google
// Analytics 4, Google Tag Manager, Meta Pixel, TikTok Pixel, and the site-verification codes for Google Search
// Console, Bing, Meta and Pinterest. Pure (no server imports) so tests/store-traffic.test.mjs runs it.
//
// Everything is re-validated on the way OUT as well as on save: a value saved by an older version, or edited in
// the database, still can't put script on a storefront. Tags are only for live store pages (see
// src/components/storefront/StoreTrackingTags.tsx and src/lib/storefront/tracking.server.ts).

import {
  bingSiteVerification,
  facebookDomainVerification,
  gaMeasurementId,
  googleSiteVerification,
  gtmContainerId,
  metaPixelId,
  pinterestSiteVerification,
  scriptSafeJson,
  tiktokPixelId,
} from "../security/html.ts";

export interface StoreIntegrations {
  googleAnalyticsId: string;
  gtmContainerId: string;
  metaPixelId: string;
  tiktokPixelId: string;
  /** Google Search Console HTML tag (stored as gaSiteVerification, its original key). */
  gaSiteVerification: string;
  bingSiteVerification: string;
  facebookDomainVerification: string;
  pinterestSiteVerification: string;
}

export type IntegrationKey = keyof StoreIntegrations;

/** Each connection's validator; the form, the saved value and the storefront all go through these. */
export const INTEGRATION_VALIDATORS: Record<IntegrationKey, (value: unknown) => string> = {
  googleAnalyticsId: gaMeasurementId,
  gtmContainerId,
  metaPixelId,
  tiktokPixelId,
  gaSiteVerification: googleSiteVerification,
  bingSiteVerification,
  facebookDomainVerification,
  pinterestSiteVerification,
};

export const INTEGRATION_KEYS = Object.keys(INTEGRATION_VALIDATORS) as IntegrationKey[];

export const EMPTY_INTEGRATIONS: StoreIntegrations = Object.fromEntries(INTEGRATION_KEYS.map((key) => [key, ""])) as unknown as StoreIntegrations;

/** The validated connections from brandSettings (anything malformed reads as not set). */
export function readIntegrations(brandSettings: unknown): StoreIntegrations {
  const settings = brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {};
  const raw = settings.integrations && typeof settings.integrations === "object" && !Array.isArray(settings.integrations) ? (settings.integrations as Record<string, unknown>) : {};
  const out = { ...EMPTY_INTEGRATIONS };
  for (const key of INTEGRATION_KEYS) out[key] = INTEGRATION_VALIDATORS[key](raw[key]);
  return out;
}

/**
 * The form on Settings › Connections → the values to save, and the fields that were filled in but not valid (so the
 * page can say which one, instead of silently dropping it). An empty field clears that connection.
 */
export function parseIntegrationsForm(get: (name: string) => unknown): { values: StoreIntegrations; invalid: IntegrationKey[] } {
  const values = { ...EMPTY_INTEGRATIONS };
  const invalid: IntegrationKey[] = [];
  for (const key of INTEGRATION_KEYS) {
    const raw = get(key);
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) continue;
    const clean = INTEGRATION_VALIDATORS[key](text);
    if (clean) values[key] = clean;
    else invalid.push(key);
  }
  return { values, invalid };
}

/** Next.js metadata for the verification <meta> tags (the store home page, free address and own domain alike). */
export function storeVerificationMetadata(integrations: StoreIntegrations): { verification?: { google?: string; other?: Record<string, string> } } {
  const other: Record<string, string> = {};
  if (integrations.bingSiteVerification) other["msvalidate.01"] = integrations.bingSiteVerification;
  if (integrations.facebookDomainVerification) other["facebook-domain-verification"] = integrations.facebookDomainVerification;
  if (integrations.pinterestSiteVerification) other["p:domain_verify"] = integrations.pinterestSiteVerification;
  const google = integrations.gaSiteVerification;
  if (!google && !Object.keys(other).length) return {};
  return { verification: { ...(google ? { google } : {}), ...(Object.keys(other).length ? { other } : {}) } };
}

export interface TrackingScript {
  id: string;
  /** The cookie-banner category that must be accepted before it loads (src/lib/storefront/consent.ts). */
  category: "analytics" | "marketing";
  /** An external script to load (Google's own tag URL). */
  src?: string;
  /** Inline code, built only from validated IDs. */
  inline?: string;
}

/** The tracking scripts for a live store page, in load order. Empty when nothing is connected. */
export function trackingScripts(integrations: StoreIntegrations): TrackingScript[] {
  const out: TrackingScript[] = [];
  const ga = gaMeasurementId(integrations.googleAnalyticsId);
  const gtm = gtmContainerId(integrations.gtmContainerId);
  const meta = metaPixelId(integrations.metaPixelId);
  const tiktok = tiktokPixelId(integrations.tiktokPixelId);
  if (ga) {
    out.push({ id: "ga4-src", category: "analytics", src: `https://www.googletagmanager.com/gtag/js?id=${ga}` });
    out.push({ id: "ga4-init", category: "analytics", inline: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${scriptSafeJson(ga)});` });
  }
  if (gtm) {
    out.push({
      id: "gtm-init",
      category: "analytics",
      inline: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${scriptSafeJson(gtm)});`,
    });
  }
  if (meta) {
    out.push({
      id: "meta-pixel",
      category: "marketing",
      inline: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${scriptSafeJson(meta)});fbq('track','PageView');`,
    });
  }
  if (tiktok) {
    out.push({
      id: "tiktok-pixel",
      category: "marketing",
      inline: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${scriptSafeJson(tiktok)});ttq.page();}(window,document,'ttq');`,
    });
  }
  return out;
}

/** The GTM <noscript> frame's address, or "" without a container. */
export function gtmNoscriptSrc(integrations: StoreIntegrations) {
  const gtm = gtmContainerId(integrations.gtmContainerId);
  return gtm ? `https://www.googletagmanager.com/ns.html?id=${gtm}` : "";
}

/** Whether a request path is the owner's preview of the store (never tracked). */
export function isPreviewPath(path: string | null | undefined) {
  return /(^|\/)preview(\/|$|\?)/.test(path ?? "");
}

/** The store's sitemap address to submit to Google and Bing (served at the store root). */
export function sitemapUrl(storeUrl: string) {
  return `${storeUrl.replace(/\/+$/, "")}/sitemap.xml`;
}
