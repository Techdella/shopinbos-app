// Google Search Console helpers that need no server: which property fits the store, and the Search Analytics
// answer turned into plain numbers. Unit tested in tests/store-traffic.test.mjs.

export interface SearchConsoleRow {
  key: string;
  clicks: number;
  impressions: number;
  /** Click-through rate, 0..1. */
  ctr: number;
  /** Average position in Google results (1 = top). */
  position: number;
}

export interface SearchConsolePerformance {
  totals: { clicks: number; impressions: number; ctr: number | null; position: number | null };
  queries: SearchConsoleRow[];
  pages: SearchConsoleRow[];
}

/** A Search Console property name: a URL-prefix property ("https://shop.example.com/") or a domain one ("sc-domain:example.com"). */
export function validSiteUrl(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^sc-domain:[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(text)) return text.toLowerCase();
  if (/^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?\/([\w./-]*)$/i.test(text) && text.length <= 300) return text;
  return "";
}

/** Properties from Google's site list that cover one of the store's hosts, best match first. */
export function matchingSites(sites: Array<{ siteUrl: string; permissionLevel?: string }>, storeHosts: string[]) {
  const hosts = storeHosts.map((host) => host.toLowerCase().replace(/^www\./, "")).filter(Boolean);
  const covers = (siteUrl: string) => {
    if (siteUrl.startsWith("sc-domain:")) {
      const domain = siteUrl.slice("sc-domain:".length);
      return hosts.some((host) => host === domain || host.endsWith(`.${domain}`));
    }
    try {
      const host = new URL(siteUrl).hostname.replace(/^www\./, "");
      return hosts.includes(host);
    } catch {
      return false;
    }
  };
  return sites
    .filter((site) => validSiteUrl(site.siteUrl) && site.permissionLevel !== "siteUnverifiedUser")
    .map((site) => ({ siteUrl: site.siteUrl, matches: covers(site.siteUrl) }))
    .sort((a, b) => Number(b.matches) - Number(a.matches) || a.siteUrl.localeCompare(b.siteUrl));
}

function rowsOf(json: unknown): SearchConsoleRow[] {
  const rows = json && typeof json === "object" && Array.isArray((json as { rows?: unknown }).rows) ? ((json as { rows: unknown[] }).rows) : [];
  const out: SearchConsoleRow[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const key = Array.isArray(row.keys) && typeof row.keys[0] === "string" ? row.keys[0].slice(0, 200) : "";
    out.push({ key, clicks: Number(row.clicks) || 0, impressions: Number(row.impressions) || 0, ctr: Number(row.ctr) || 0, position: Math.round((Number(row.position) || 0) * 10) / 10 });
  }
  return out;
}

/** Google's three answers (no dimension, by query, by page) → one performance summary. */
export function parsePerformance(totalsJson: unknown, queriesJson: unknown, pagesJson: unknown): SearchConsolePerformance {
  const totalRow = rowsOf(totalsJson)[0];
  return {
    totals: totalRow
      ? { clicks: totalRow.clicks, impressions: totalRow.impressions, ctr: totalRow.impressions ? totalRow.clicks / totalRow.impressions : null, position: totalRow.position || null }
      : { clicks: 0, impressions: 0, ctr: null, position: null },
    queries: rowsOf(queriesJson).slice(0, 15),
    pages: rowsOf(pagesJson).slice(0, 10),
  };
}
