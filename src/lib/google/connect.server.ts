import "server-only";

import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { chooseGoogleLocation, disconnectGoogle, getGoogleConnection, listGoogleLocations, saveGoogleReviewTokens } from "@/lib/reviews/google";
import {
  disconnectSearchConsole,
  getSearchConsoleConnection,
  listSearchConsoleSites,
  saveSearchConsoleTokens,
  searchConsoleToken,
  setSearchConsoleSite,
} from "@/lib/search-console/google.server";
import { matchingSites } from "@/lib/search-console/pure";
import { readIntegrations, sitemapUrl } from "@/lib/storefront/integrations";
import { setStoreIntegration } from "@/lib/storefront/integrations.server";

// "Connect Google", after the sign-in: the one grant (src/lib/google/oauth.ts) is kept for each Google feature and
// each one is set up for the seller, so nothing is pasted or picked by hand:
//   shopping   Merchant Center product feed (src/lib/sales-channels, the "google" card)
//   reviews    Business Profile: the location is chosen when there is exactly one
//   search     Search Console: the store is added, verified (Site Verification API, META tag on the store) and its
//              sitemap submitted; or the matching property is picked when they already have it
//   analytics  GA4: a property and web stream for the store, its measurement ID saved on the store
// Each step is best effort and never throws; finishGoogleSetup runs again from the Connections page ("Finish
// setting up"), e.g. once the store is live, because Google can only verify a live page.

const VERIFY_API = "https://www.googleapis.com/siteVerification/v1";
const WEBMASTERS_API = "https://www.googleapis.com/webmasters/v3";
const ANALYTICS_ADMIN = "https://analyticsadmin.googleapis.com/v1beta";

async function call(token: string, url: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);
  if (!res) throw new Error("Couldn't reach Google");
  const json = ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as { message?: string } | undefined)?.message ?? `Google answered ${res.status}`);
  return json;
}

const quiet = (label: string) => (error: unknown) => {
  console.error(`[google] ${label} failed`, error instanceof Error ? error.message.slice(0, 200) : "unknown");
  return null;
};

async function loadStore(storeId: string) {
  return db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, customDomain: true, status: true, onboardingState: true, brandSettings: true } });
}

type StoreRow = NonNullable<Awaited<ReturnType<typeof loadStore>>>;

function storeUrl(store: StoreRow) {
  const url = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain });
  return url.endsWith("/") ? url : `${url}/`;
}

/** After the Google sign-in (sales-channels finishConnect, platform "google"): keep the grant for every feature. */
export async function connectGoogleEverything(storeId: string, tokens: { token: string; refreshToken?: string }, expiresAt: Date | null) {
  const token = { access: tokens.token, refresh: tokens.refreshToken, expiresAt };
  await saveSearchConsoleTokens(storeId, token).catch(quiet("save search tokens"));
  await saveGoogleReviewTokens(storeId, token).catch(quiet("save review tokens"));
  await finishGoogleSetup(storeId);
}

/** Sets up what's still missing for reviews, search and visitor stats. Safe to run again. */
export async function finishGoogleSetup(storeId: string) {
  const store = await loadStore(storeId);
  if (!store) return;
  await Promise.all([setupReviews(storeId).catch(quiet("reviews")), setupSearch(store).catch(quiet("search")), setupAnalytics(store).catch(quiet("analytics"))]);
}

async function setupReviews(storeId: string) {
  const connection = await getGoogleConnection(storeId);
  if (!connection || connection.locationName) return;
  const locations = await listGoogleLocations(storeId);
  // One business: use it. Several: the seller picks on the reviews page.
  if (locations.length === 1) await chooseGoogleLocation(storeId, locations[0]);
}

async function setupSearch(store: StoreRow) {
  const connection = await getSearchConsoleConnection(store.id);
  if (!connection || connection.siteUrl) return;
  const url = storeUrl(store);
  const hosts = [new URL(url).hostname, ...(store.customDomain ? [store.customDomain] : [])];
  // Already in their Search Console: use it.
  const existing = matchingSites(await listSearchConsoleSites(store.id), hosts).find((site) => site.matches);
  if (existing) return setSearchConsoleSite(store.id, existing.siteUrl);

  const token = await searchConsoleToken(store.id);
  const site = { type: "SITE", identifier: url };
  // The verification code goes on the store as a meta tag (storeVerificationMetadata), then Google checks it.
  const issued = await call(token, `${VERIFY_API}/token`, { body: { site, verificationMethod: "META" } });
  const code = /content="([^"]+)"/.exec(String(issued.token ?? ""))?.[1];
  if (!code) return;
  await setStoreIntegration(store.id, "gaSiteVerification", code);
  // Same rule as Start here: Store.status defaults to "active", so it alone doesn't mean launched.
  const editor = (store.brandSettings as { editor?: { published?: unknown } } | null)?.editor;
  const live = store.onboardingState === "LIVE" || (store.status === "active" && Boolean(editor?.published));
  if (!live) return; // Google can only check a live page; "Finish setting up" tries again.
  await call(token, `${VERIFY_API}/webResource?verificationMethod=META`, { body: { site } });
  await call(token, `${WEBMASTERS_API}/sites/${encodeURIComponent(url)}`, { method: "PUT" });
  await call(token, `${WEBMASTERS_API}/sites/${encodeURIComponent(url)}/sitemaps/${encodeURIComponent(sitemapUrl(url))}`, { method: "PUT" }).catch(quiet("sitemap"));
  await setSearchConsoleSite(store.id, url);
}

async function setupAnalytics(store: StoreRow) {
  if (readIntegrations(store.brandSettings).googleAnalyticsId) return;
  if (!(await getSearchConsoleConnection(store.id))) return;
  const token = await searchConsoleToken(store.id);
  const url = storeUrl(store);
  const summaries = await call(token, `${ANALYTICS_ADMIN}/accountSummaries?pageSize=50`);
  const accounts = (Array.isArray(summaries.accountSummaries) ? summaries.accountSummaries : []) as Array<{ account?: string; propertySummaries?: Array<{ property?: string; displayName?: string }> }>;
  const account = accounts.find((item) => typeof item.account === "string");
  if (!account?.account) return; // No Google Analytics account: the Connections page offers to create one.
  const name = `${store.name.trim().slice(0, 80) || "My shop"} (Shopinbos)`;
  let property = account.propertySummaries?.find((item) => item.displayName === name)?.property;
  if (!property) {
    const created = await call(token, `${ANALYTICS_ADMIN}/properties`, { body: { parent: account.account, displayName: name, timeZone: "Africa/Lagos", currencyCode: "NGN", industryCategory: "SHOPPING" } });
    property = typeof created.name === "string" ? created.name : undefined;
  }
  if (!property) return;
  const streams = await call(token, `${ANALYTICS_ADMIN}/${property}/dataStreams`);
  const list = (Array.isArray(streams.dataStreams) ? streams.dataStreams : []) as Array<{ webStreamData?: { measurementId?: string; defaultUri?: string } }>;
  let measurementId = list.find((item) => item.webStreamData?.measurementId)?.webStreamData?.measurementId;
  if (!measurementId) {
    const created = await call(token, `${ANALYTICS_ADMIN}/${property}/dataStreams`, { body: { type: "WEB_DATA_STREAM", displayName: name, webStreamData: { defaultUri: url.replace(/\/$/, "") } } });
    measurementId = (created.webStreamData as { measurementId?: string } | undefined)?.measurementId;
  }
  if (measurementId) await setStoreIntegration(store.id, "googleAnalyticsId", measurementId, { onlyIfEmpty: true });
}

/** Disconnect on the Google card: reviews and search stop too (the visitor-stats tag stays on the store). */
export async function disconnectGoogleEverything(storeId: string) {
  await disconnectGoogle(storeId).catch(quiet("disconnect reviews"));
  await disconnectSearchConsole(storeId).catch(quiet("disconnect search"));
}

export interface GoogleOverview {
  reviews: { state: "on" | "choose" | "off"; name: string | null };
  search: { state: "on" | "waiting" | "off"; site: string | null };
  analytics: { state: "on" | "none" | "off" };
}

/** What the Google card says under each line ("off" = not signed in for that part yet). */
export async function googleOverview(storeId: string, brandSettings: unknown): Promise<GoogleOverview> {
  const [reviews, search] = await Promise.all([getGoogleConnection(storeId), getSearchConsoleConnection(storeId)]);
  const analyticsId = readIntegrations(brandSettings).googleAnalyticsId;
  return {
    reviews: !reviews ? { state: "off", name: null } : reviews.locationName ? { state: "on", name: reviews.locationTitle ?? null } : { state: "choose", name: null },
    search: !search ? { state: "off", site: null } : search.siteUrl ? { state: "on", site: search.siteUrl } : { state: "waiting", site: null },
    analytics: analyticsId ? { state: "on" } : search ? { state: "none" } : { state: "off" },
  };
}
