// Telling search and AI engines a store's pages exist the moment it goes live, rather than waiting for a crawler to
// find them. Pure (no imports) so src/lib/seo/search-ping.server.ts and tests/storefront-seo.test.mjs share it.
//
// IndexNow (Bing, which feeds ChatGPT search and Copilot, plus Yandex, Seznam, Naver…) takes the URLs themselves and
// checks a key file on each host. Google has no URL ping for shop pages, so we submit the store's sitemap to Search
// Console (the sc-domain property that covers every store subdomain), which queues it for crawling.

/** Where every host (app, store subdomains, custom domains) serves the IndexNow key (src/app/indexnow.txt). */
export const INDEXNOW_KEY_PATH = "/indexnow.txt";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow accepts up to 10,000 URLs per request. */
export const INDEXNOW_MAX_URLS = 10_000;

/** IndexNow keys are 8–128 characters of letters, digits and dashes. */
export function validIndexNowKey(key: string | null | undefined): key is string {
  return typeof key === "string" && /^[a-zA-Z0-9-]{8,128}$/.test(key);
}

export interface IndexNowBody {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** One IndexNow request per host (a request may only list URLs on its own host), https URLs only, each once. */
export function indexNowBodies(urls: readonly string[], key: string): IndexNowBody[] {
  const byHost = new Map<string, string[]>();
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    const list = byHost.get(url.host) ?? [];
    if (!list.includes(url.toString()) && list.length < INDEXNOW_MAX_URLS) list.push(url.toString());
    byHost.set(url.host, list);
  }
  return [...byHost].map(([host, urlList]) => ({ host, key, keyLocation: `https://${host}${INDEXNOW_KEY_PATH}`, urlList }));
}

/** The Search Console property stores live under: GOOGLE_SEARCH_CONSOLE_SITE, else the root domain's sc-domain property. */
export function searchConsoleSite(explicit: string | null | undefined, rootDomain: string) {
  const site = explicit?.trim();
  if (site) return site;
  return rootDomain && rootDomain !== "localhost" ? `sc-domain:${rootDomain}` : null;
}

/** True when a URL is on a host the property covers (a domain property covers the domain and every subdomain). */
export function inSearchConsoleSite(url: string, site: string) {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (site.startsWith("sc-domain:")) {
    const domain = site.slice("sc-domain:".length).toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    return new URL(site).hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}
