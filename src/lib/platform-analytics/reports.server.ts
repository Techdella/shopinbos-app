import "server-only";

import { mixpanelConfig, posthogConfig, PROVIDER_LABELS, type AnalyticsProvider } from "./config";

// Admin › Analytics reads the last N days back from each connected tool with read-only server keys:
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
  return Promise.all([mixpanelReport(days), posthogReport(days)]);
}
