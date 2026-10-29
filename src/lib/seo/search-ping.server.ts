import "server-only";

import { after } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { getPlatformRootDomain } from "@/lib/domains/storefront";
import { INDEXNOW_ENDPOINT, inSearchConsoleSite, indexNowBodies, searchConsoleSite, validIndexNowKey } from "./search-ping";
import { loadStoreSitemapEntries, storeSearchState, storeUrl } from "./store-seo.server";

// Announces a live store's pages to search and AI engines as soon as it's published or gets a new product
// (src/lib/seo/search-ping.ts says how). Runs after the response is sent and never fails the caller; each engine is
// skipped while its env var is unset:
//   INDEXNOW_KEY                                 any 8–128 letters, digits or dashes; served at /indexnow.txt
//   GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON   key file (raw JSON or base64) of a service account added as an
//                                                Owner of the Search Console property
//   GOOGLE_SEARCH_CONSOLE_SITE                   optional; defaults to sc-domain:<NEXT_PUBLIC_ROOT_DOMAIN>

const TIMEOUT_MS = 10_000;

export function indexNowKey() {
  const key = process.env.INDEXNOW_KEY?.trim();
  return validIndexNowKey(key) ? key : null;
}

async function pingIndexNow(urls: readonly string[]) {
  const key = indexNowKey();
  if (!key) return;
  for (const body of indexNowBodies(urls, key)) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 200 and 202 both mean accepted.
    if (!response.ok) console.warn(`[search-ping] IndexNow ${body.host}: ${response.status}`);
  }
}

// ─── Google Search Console ───────────────────────────────────────────────────

let googleToken: { value: string; expires: number } | null = null;

async function searchConsoleToken(raw: string) {
  if (googleToken && googleToken.expires > Date.now() + 60_000) return googleToken.value;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const account = JSON.parse(text) as { client_email?: string; private_key?: string };
  if (!account.client_email || !account.private_key) throw new Error("service account needs client_email and private_key");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/webmasters" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(account.private_key.replace(/\\n/g, "\n"), "RS256"));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`token ${response.status}`);
  const token = (await response.json()) as { access_token: string; expires_in: number };
  googleToken = { value: token.access_token, expires: Date.now() + token.expires_in * 1000 };
  return googleToken.value;
}

/** Submits (or resubmits) a sitemap to Search Console, which queues it for Googlebot. */
async function submitSitemap(sitemapUrl: string) {
  const serviceAccount = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON;
  const site = searchConsoleSite(process.env.GOOGLE_SEARCH_CONSOLE_SITE, getPlatformRootDomain());
  // A custom domain isn't in our property; the seller's own Search Console reads its sitemap from robots.txt.
  if (!serviceAccount || !site || !inSearchConsoleSite(sitemapUrl, site)) return;
  const token = await searchConsoleToken(serviceAccount);
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!response.ok) console.warn(`[search-ping] Search Console ${sitemapUrl}: ${response.status} ${(await response.text()).slice(0, 200)}`);
}

// ─── Entry points ────────────────────────────────────────────────────────────

/** Runs after the response when inside a request, else straight away; errors are only logged. */
function inBackground(task: () => Promise<unknown>) {
  const run = () => task().catch((error) => console.warn("[search-ping]", error instanceof Error ? error.message : error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** A store just went live or was republished: every page in its sitemap to IndexNow, its sitemap to Google. */
export function announceStore(slug: string) {
  inBackground(async () => {
    const state = await storeSearchState(slug);
    if (!state?.indexable) return;
    const entries = await loadStoreSitemapEntries(slug);
    await Promise.allSettled([pingIndexNow(entries.map((entry) => entry.loc)), submitSitemap(storeUrl(state.store, "/sitemap.xml"))]);
  });
}

/**
 * New or changed pages of a live store (a product added): those URLs to IndexNow, the sitemap to Google again. Only
 * paths the sitemap lists are sent, so a hidden or draft product is never announced.
 */
export function announceStorePaths(slug: string, paths: readonly string[]) {
  inBackground(async () => {
    const state = await storeSearchState(slug);
    if (!state?.indexable) return;
    const listed = new Set((await loadStoreSitemapEntries(slug)).map((entry) => entry.loc));
    const urls = paths.map((path) => storeUrl(state.store, path)).filter((url) => listed.has(url));
    if (!urls.length) return;
    await Promise.allSettled([pingIndexNow(urls), submitSitemap(storeUrl(state.store, "/sitemap.xml"))]);
  });
}
