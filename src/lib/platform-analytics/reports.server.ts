import "server-only";

import { SignJWT, importPKCS8 } from "jose";
import { ga4Config, mixpanelConfig, posthogConfig, PROVIDER_LABELS, type AnalyticsProvider } from "./config";

// Admin › Analytics reads the last N days back from each connected tool with read-only server keys:
//   GA4       Data API (service account with Viewer on the property)
//   Mixpanel  Query API (service account)
//   PostHog   HogQL query API (personal API key with query:read)
// Each report is the same shape so the page draws them alike. A tool that isn't set up or errors returns
// { ok: false } with the reason, and the rest of the page still loads.

export type Row = { label: string; value: number };
export type ProviderReport =
  | { provider: AnalyticsProvider; label: string; ok: true; series: { name: string; points: Array<{ date: string; value: number }> }; totals: Row[]; tables: Array<{ title: string; rows: Row[] }> }
  | { provider: AnalyticsProvider; label: string; ok: false; error: string };

const TIMEOUT_MS = 10_000;

async function json<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const fail = (provider: AnalyticsProvider, error: unknown): ProviderReport => ({ provider, label: PROVIDER_LABELS[provider], ok: false, error: error instanceof Error ? error.message : String(error) });

// ─── Google Analytics 4 ─────────────────────────────────────────────────────────────────────────────────────────

/** GA4_SERVICE_ACCOUNT_JSON is the key file Google gives you, as raw JSON or base64. */
function readServiceAccount(raw: string) {
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(text) as { client_email?: string; private_key?: string };
  if (!parsed.client_email || !parsed.private_key) throw new Error("GA4_SERVICE_ACCOUNT_JSON needs client_email and private_key");
  return { email: parsed.client_email, key: parsed.private_key.replace(/\\n/g, "\n") };
}

let gaToken: { value: string; expires: number } | null = null;

async function googleToken(serviceAccount: string) {
  if (gaToken && gaToken.expires > Date.now() + 60_000) return gaToken.value;
  const account = readServiceAccount(serviceAccount);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/analytics.readonly" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(account.key, "RS256"));
  const token = await json<{ access_token: string; expires_in: number }>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  gaToken = { value: token.access_token, expires: Date.now() + token.expires_in * 1000 };
  return gaToken.value;
}

type GaReport = { rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }> };

export async function ga4Report(days: number): Promise<ProviderReport> {
  const ga = ga4Config();
  if (!ga.propertyId || !ga.serviceAccount) return fail("ga4", "Not connected: set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON.");
  try {
    const token = await googleToken(ga.serviceAccount);
    const run = (body: object) =>
      json<GaReport>(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(ga.propertyId)}:runReport`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }], ...body }),
      });
    const [daily, totals, channels, sources] = await Promise.all([
      run({ dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }], orderBys: [{ dimension: { dimensionName: "date" } }] }),
      run({ metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }, { name: "engagementRate" }] }),
      run({ dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "newUsers" }], orderBys: [{ metric: { metricName: "newUsers" }, desc: true }], limit: 10 }),
      run({ dimensions: [{ name: "sessionSourceMedium" }], metrics: [{ name: "newUsers" }], orderBys: [{ metric: { metricName: "newUsers" }, desc: true }], limit: 10 }),
    ]);
    const metric = (report: GaReport, index: number) => Number(report.rows?.[0]?.metricValues?.[index]?.value ?? 0);
    const rows = (report: GaReport) => (report.rows ?? []).map((row) => ({ label: row.dimensionValues?.[0]?.value || "(not set)", value: Number(row.metricValues?.[0]?.value ?? 0) }));
    return {
      provider: "ga4",
      label: PROVIDER_LABELS.ga4,
      ok: true,
      series: {
        name: "Active users",
        points: (daily.rows ?? []).map((row) => {
          const d = row.dimensionValues?.[0]?.value ?? "";
          return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, value: Number(row.metricValues?.[0]?.value ?? 0) };
        }),
      },
      totals: [
        { label: "Active users", value: metric(totals, 0) },
        { label: "New users", value: metric(totals, 1) },
        { label: "Sessions", value: metric(totals, 2) },
        { label: "Engagement rate %", value: Math.round(metric(totals, 3) * 1000) / 10 },
      ],
      tables: [
        { title: "New users by channel", rows: rows(channels) },
        { title: "New users by source / medium", rows: rows(sources) },
      ],
    };
  } catch (error) {
    return fail("ga4", error);
  }
}

// ─── Mixpanel ───────────────────────────────────────────────────────────────────────────────────────────────────

export async function mixpanelReport(days: number): Promise<ProviderReport> {
  const mp = mixpanelConfig();
  if (!mp.projectId || !mp.serviceUser || !mp.serviceSecret) return fail("mixpanel", "Not connected: set MIXPANEL_PROJECT_ID and a service account (MIXPANEL_SERVICE_ACCOUNT_USERNAME / _SECRET).");
  try {
    const auth = `Basic ${Buffer.from(`${mp.serviceUser}:${mp.serviceSecret}`).toString("base64")}`;
    const from = isoDay(new Date(Date.now() - days * 86_400_000));
    const to = isoDay(new Date());
    const get = <T,>(path: string, params: Record<string, string>) =>
      json<T>(`${mp.queryHost}/api/query/${path}?${new URLSearchParams({ project_id: mp.projectId, ...params })}`, { headers: { Authorization: auth, Accept: "application/json" } });
    type Segmentation = { data?: { series?: string[]; values?: Record<string, Record<string, number>> } };
    const [pageviews, signups, top] = await Promise.all([
      get<Segmentation>("segmentation", { event: "$mp_web_page_view", from_date: from, to_date: to, unit: "day", type: "unique" }),
      get<Segmentation>("segmentation", { event: "signed_up", from_date: from, to_date: to, unit: "day", type: "general" }),
      get<{ events?: Array<{ event: string; amount: number }> }>("events/top", { type: "general", limit: "10" }),
    ]);
    const values = (report: Segmentation) => Object.values(report.data?.values ?? {})[0] ?? {};
    const daily = values(pageviews);
    const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
    return {
      provider: "mixpanel",
      label: PROVIDER_LABELS.mixpanel,
      ok: true,
      series: { name: "Daily unique visitors", points: (pageviews.data?.series ?? []).map((date) => ({ date, value: daily[date] ?? 0 })) },
      totals: [
        { label: "Visitor-days", value: sum(daily) },
        { label: "Sign-ups", value: sum(values(signups)) },
      ],
      tables: [{ title: "Top events today", rows: (top.events ?? []).map((row) => ({ label: row.event, value: row.amount })) }],
    };
  } catch (error) {
    return fail("mixpanel", error);
  }
}

// ─── PostHog ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function posthogReport(days: number): Promise<ProviderReport> {
  const ph = posthogConfig();
  if (!ph.projectId || !ph.personalApiKey) return fail("posthog", "Not connected: set POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY.");
  try {
    const query = (sql: string) =>
      json<{ results?: unknown[][] }>(`${ph.appHost}/api/projects/${encodeURIComponent(ph.projectId)}/query/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ph.personalApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query: sql } }),
      });
    const n = Math.max(1, Math.min(365, Math.floor(days)));
    const [daily, totals, referrers, events] = await Promise.all([
      query(`SELECT toDate(timestamp) AS day, count(DISTINCT person_id) FROM events WHERE timestamp > now() - INTERVAL ${n} DAY GROUP BY day ORDER BY day`),
      query(`SELECT count(DISTINCT person_id), countIf(event = 'signed_up'), countIf(event = '$pageview') FROM events WHERE timestamp > now() - INTERVAL ${n} DAY`),
      query(`SELECT coalesce(nullIf(properties.$referring_domain, ''), '$direct') AS ref, count(DISTINCT person_id) AS people FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${n} DAY GROUP BY ref ORDER BY people DESC LIMIT 10`),
      query(`SELECT event, count() AS c FROM events WHERE timestamp > now() - INTERVAL ${n} DAY GROUP BY event ORDER BY c DESC LIMIT 10`),
    ]);
    const rows = (result: { results?: unknown[][] }) => (result.results ?? []).map((row) => ({ label: String(row[0] ?? ""), value: Number(row[1] ?? 0) }));
    const t = totals.results?.[0] ?? [];
    return {
      provider: "posthog",
      label: PROVIDER_LABELS.posthog,
      ok: true,
      series: { name: "Daily active people", points: rows(daily).map((row) => ({ date: row.label.slice(0, 10), value: row.value })) },
      totals: [
        { label: "People", value: Number(t[0] ?? 0) },
        { label: "Sign-ups", value: Number(t[1] ?? 0) },
        { label: "Page views", value: Number(t[2] ?? 0) },
      ],
      tables: [
        { title: "Visitors by referring site", rows: rows(referrers) },
        { title: "Top events", rows: rows(events) },
      ],
    };
  } catch (error) {
    return fail("posthog", error);
  }
}

export function providerReports(days: number) {
  return Promise.all([ga4Report(days), mixpanelReport(days), posthogReport(days)]);
}
