// What GET /api/mobile/insights sends the phone (board M-Insights): four numbers with their change against the
// period before, the top visit sources as shares of all visits, and the best sellers. Pure (no server imports), so
// tests/mobile-grow.test.mjs runs it directly.
import type { AnalyticsReport } from "./compute";

export interface MobileInsights {
  range: string;
  /** False until the storefront counters table exists (then visits are 0 and sources empty). */
  visitsCounted: boolean;
  sales: { value: number; change: number | null; diff: number };
  orders: { value: number; change: number | null; diff: number };
  visits: { value: number; change: number | null; diff: number };
  /** Paid online orders per visit (0..1), null without visits. */
  conversion: { value: number | null; previous: number | null };
  sources: Array<{ key: string; label: string; visits: number; share: number }>;
  bestSellers: Array<{ key: string; productId: string | null; name: string; image: string | null; quantity: number; sales: number }>;
}

/** At most this many sources; the rest are added up as "Other". */
export const MAX_SOURCES = 4;

export function insightsSummary(report: AnalyticsReport, range: string, visitsCounted: boolean): MobileInsights {
  const k = report.kpis;
  const p = report.previous;
  const total = report.sources.reduce((sum, row) => sum + row.visits, 0);
  const top = report.sources.slice(0, MAX_SOURCES);
  const rest = report.sources.slice(MAX_SOURCES).reduce((sum, row) => sum + row.visits, 0);
  const rows = rest > 0 ? [...top, { key: "other", label: "Other", visits: rest }] : top;
  return {
    range,
    visitsCounted,
    sales: { value: k.sales, change: report.change.sales ?? null, diff: k.sales - p.sales },
    orders: { value: k.orders, change: report.change.orders ?? null, diff: k.orders - p.orders },
    visits: { value: k.visits, change: report.change.visits ?? null, diff: k.visits - p.visits },
    conversion: { value: k.conversionRate, previous: p.conversionRate },
    sources: total > 0 ? rows.map((row) => ({ key: row.key || "direct", label: row.label, visits: row.visits, share: row.visits / total })) : [],
    bestSellers: report.topProducts.slice(0, 3).map((row) => ({ key: row.key, productId: row.productId, name: row.name, image: row.image, quantity: row.quantity, sales: row.sales })),
  };
}
