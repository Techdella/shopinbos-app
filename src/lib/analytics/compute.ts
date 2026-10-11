// Seller analytics: every number on /home/analytics (and its CSV export) comes from here.
// Pure: takes rows already loaded from Postgres and returns plain data, so it is unit tested in tests/behaviour.test.mjs.

import { PAID_ORDER_STATUSES } from "../insights.ts";
import { CHANNEL_LABEL, type OrderChannel } from "../../../shared/channels.ts";
import { rangeBuckets, type ResolvedRange } from "./range.ts";

export const REFUND_STATUSES = ["refunded", "partially_refunded", "returned", "cancelled"] as const;
export const FUNNEL_METRICS = ["visit", "product_view", "add_to_cart", "checkout_start"] as const;
export type FunnelMetric = (typeof FUNNEL_METRICS)[number];

export interface AnalyticsOrder {
  id: string;
  total: number;
  status: string;
  createdAt: Date;
  buyerEmail: string;
  buyerPhone: string | null;
  channel: string | null;
  items: unknown;
  discountCode: string | null;
  discountAmount: number | null;
  campaignToken: string | null;
  affiliateId: string | null;
  adCampaignId: string | null;
}

export interface MetricRow {
  day: string;
  metric: string;
  channel: string;
  campaign: string;
  productId: string;
  count: number;
}

export interface AnalyticsInput {
  range: ResolvedRange;
  now: Date;
  /** Orders created in the current or previous period (any status). */
  orders: AnalyticsOrder[];
  /** Every paid order's buyer and date (all time), to tell new customers from returning ones. */
  paidHistory: Array<{ buyerEmail: string; buyerPhone: string | null; createdAt: Date }>;
  /** StoreMetricDaily rows for the current and previous period. */
  metrics: MetricRow[];
  /** First day each storefront metric was ever counted for this store (tracking start). */
  metricSince: Partial<Record<FunnelMetric, string>>;
  products: Array<{ id: string; name: string; image: string | null }>;
  campaigns: Array<{ id: string; name: string }>;
  /** CampaignRecipient token → campaign id, for orders that came from an email. */
  campaignTokens: Array<{ token: string; campaignId: string }>;
  ads: Array<{ id: string; headline: string; platform: string; spend: number; clicks: number }>;
  affiliates: Array<{ id: string; name: string; code: string }>;
}

export interface Kpis {
  sales: number;
  orders: number;
  aov: number;
  visits: number;
  /** Paid online orders / visits; null without visits. */
  conversionRate: number | null;
  customers: number;
  returningCustomers: number;
  returningRate: number | null;
  refundsCount: number;
  refundsValue: number;
  placedOrders: number;
}

export type KpiKey = keyof Kpis;

export interface AttributionRow {
  key: string;
  label: string;
  sub?: string;
  orders: number;
  sales: number;
  /** Extra money column: discount given, commission owed, or ad spend. */
  extra?: number;
}

export interface AnalyticsReport {
  kpis: Kpis;
  previous: Kpis;
  /** Percent change per KPI, null when there's nothing to compare against. */
  change: Partial<Record<KpiKey, number | null>>;
  series: Array<{ label: string; sales: number | null; orders: number | null; previousSales: number; previousOrders: number; visits: number | null }>;
  topProducts: Array<{ key: string; productId: string | null; name: string; image: string | null; quantity: number; sales: number; views: number | null }>;
  channels: Array<{ key: string; label: string; orders: number; sales: number; visits: number }>;
  sources: Array<{ key: string; label: string; visits: number }>;
  utmCampaigns: Array<{ key: string; visits: number }>;
  customers: { new: { customers: number; orders: number; sales: number }; returning: { customers: number; orders: number; sales: number } };
  attribution: { email: AttributionRow[]; ads: AttributionRow[]; affiliates: AttributionRow[]; discounts: AttributionRow[] };
  funnel: Array<{ key: FunnelMetric | "placed" | "paid"; label: string; count: number; since: string | null }>;
}

const PAID = new Set<string>(PAID_ORDER_STATUSES);
const REFUNDED = new Set<string>(REFUND_STATUSES);
const ONLINE_EXCLUDED = new Set(["in_person"]);

export function isPaid(status: string) {
  return PAID.has(status);
}

/** Who bought: email when there is one, else the phone's last 10 digits (in-person sales often have no email). */
export function customerKey(email: string | null | undefined, phone: string | null | undefined) {
  const mail = (email ?? "").trim().toLowerCase();
  if (mail.includes("@")) return `e:${mail}`;
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? `p:${digits.slice(-10)}` : null;
}

export function percentChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

const EXTRA_LABEL: Record<string, string> = { x: "X (Twitter)", meta: "Facebook or Instagram Shop", sms: "SMS" };

export function channelLabel(key: string) {
  if (!key) return "Not recorded";
  return CHANNEL_LABEL[key as OrderChannel] ?? EXTRA_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function sourceLabel(key: string) {
  return key ? channelLabel(key) : "Direct or untagged";
}

interface Line {
  productId: string | null;
  name: string;
  quantity: number;
  price: number;
}

export function orderLines(items: unknown): Line[] {
  if (!Array.isArray(items)) return [];
  const lines: Line[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Item";
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const price = Number(item.price) || 0;
    lines.push({ productId: typeof item.productId === "string" && item.productId ? item.productId : null, name, quantity, price });
  }
  return lines;
}

const inRange = (date: Date, start: Date, end: Date) => date.getTime() >= start.getTime() && date.getTime() < end.getTime();

function dayInRange(day: string, start: Date, end: Date) {
  // Metric days are Lagos dates; compare them by their Lagos midnight.
  const at = Date.parse(`${day}T00:00:00+01:00`);
  return at >= start.getTime() && at < end.getTime();
}

function firstPaidByCustomer(history: AnalyticsInput["paidHistory"]) {
  const first = new Map<string, number>();
  for (const row of history) {
    const key = customerKey(row.buyerEmail, row.buyerPhone);
    if (!key) continue;
    const at = row.createdAt.getTime();
    const seen = first.get(key);
    if (seen === undefined || at < seen) first.set(key, at);
  }
  return first;
}

function kpisFor(orders: AnalyticsOrder[], visits: number, start: Date, firstPaid: Map<string, number>): Kpis {
  const paid = orders.filter((order) => isPaid(order.status));
  const sales = paid.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const onlinePaid = paid.filter((order) => !ONLINE_EXCLUDED.has(order.channel ?? "")).length;
  const customers = new Set<string>();
  const returning = new Set<string>();
  for (const order of paid) {
    const key = customerKey(order.buyerEmail, order.buyerPhone);
    if (!key) continue;
    customers.add(key);
    const first = firstPaid.get(key);
    if (first !== undefined && first < start.getTime()) returning.add(key);
  }
  const refunds = orders.filter((order) => REFUNDED.has(order.status));
  return {
    sales,
    orders: paid.length,
    aov: paid.length ? sales / paid.length : 0,
    visits,
    conversionRate: visits > 0 ? onlinePaid / visits : null,
    customers: customers.size,
    returningCustomers: returning.size,
    returningRate: customers.size ? returning.size / customers.size : null,
    refundsCount: refunds.length,
    refundsValue: refunds.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    placedOrders: orders.length,
  };
}

function sumMetric(rows: MetricRow[], metric: string, start: Date, end: Date) {
  return rows.reduce((sum, row) => (row.metric === metric && dayInRange(row.day, start, end) ? sum + row.count : sum), 0);
}

function addTo<K>(map: Map<K, AttributionRow>, key: K, make: () => AttributionRow, order: AnalyticsOrder, extra = 0) {
  const row = map.get(key) ?? make();
  row.orders += 1;
  row.sales += Number(order.total) || 0;
  if (extra) row.extra = (row.extra ?? 0) + extra;
  map.set(key, row);
}

const bySales = (a: { sales: number; orders: number }, b: { sales: number; orders: number }) => b.sales - a.sales || b.orders - a.orders;

export function computeAnalytics(input: AnalyticsInput): AnalyticsReport {
  const { range, now } = input;
  const current = input.orders.filter((order) => inRange(order.createdAt, range.start, range.end));
  const previous = input.orders.filter((order) => inRange(order.createdAt, range.previous.start, range.previous.end));
  const firstPaid = firstPaidByCustomer(input.paidHistory);

  const visits = sumMetric(input.metrics, "visit", range.start, range.end);
  const previousVisits = sumMetric(input.metrics, "visit", range.previous.start, range.previous.end);
  const kpis = kpisFor(current, visits, range.start, firstPaid);
  const prev = kpisFor(previous, previousVisits, range.previous.start, firstPaid);
  const change: AnalyticsReport["change"] = {};
  for (const key of Object.keys(kpis) as KpiKey[]) change[key] = percentChange(kpis[key], prev[key]);

  // Sales over time, with the previous period lined up bucket by bucket.
  const length = range.end.getTime() - range.start.getTime();
  const visitsByDay = new Map<string, number>();
  for (const row of input.metrics) if (row.metric === "visit") visitsByDay.set(row.day, (visitsByDay.get(row.day) ?? 0) + row.count);
  const series = rangeBuckets(range).map((bucket) => {
    const future = bucket.start.getTime() > now.getTime();
    const paidIn = (start: Date, end: Date) => input.orders.filter((order) => isPaid(order.status) && inRange(order.createdAt, start, end));
    const here = paidIn(bucket.start, bucket.end);
    const there = paidIn(new Date(bucket.start.getTime() - length), new Date(bucket.end.getTime() - length));
    let bucketVisits: number | null = null;
    if (range.bucket !== "hour" && !future) {
      bucketVisits = 0;
      for (const [day, count] of visitsByDay) if (dayInRange(day, bucket.start, bucket.end)) bucketVisits += count;
    }
    return {
      label: bucket.label,
      sales: future ? null : here.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      orders: future ? null : here.length,
      previousSales: there.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      previousOrders: there.length,
      visits: bucketVisits,
    };
  });

  // Top products from paid order lines; views from the storefront counter where the line has a product id.
  const productById = new Map(input.products.map((product) => [product.id, product]));
  const views = new Map<string, number>();
  for (const row of input.metrics) {
    if (row.metric === "product_view" && row.productId && dayInRange(row.day, range.start, range.end)) views.set(row.productId, (views.get(row.productId) ?? 0) + row.count);
  }
  const products = new Map<string, AnalyticsReport["topProducts"][number]>();
  for (const order of current) {
    if (!isPaid(order.status)) continue;
    for (const line of orderLines(order.items)) {
      const key = line.productId ?? `name:${line.name.toLowerCase()}`;
      const known = line.productId ? productById.get(line.productId) : undefined;
      const row = products.get(key) ?? {
        key,
        productId: line.productId,
        name: known?.name ?? line.name,
        image: known?.image ?? null,
        quantity: 0,
        sales: 0,
        views: line.productId ? views.get(line.productId) ?? 0 : null,
      };
      row.quantity += line.quantity;
      row.sales += line.price * line.quantity;
      products.set(key, row);
    }
  }
  const topProducts = [...products.values()].sort((a, b) => b.sales - a.sales || b.quantity - a.quantity).slice(0, 10);

  // Channels: paid orders by the channel saved on the order, visits by the source on the storefront link.
  const visitsBySource = new Map<string, number>();
  const utm = new Map<string, number>();
  for (const row of input.metrics) {
    if (row.metric !== "visit" || !dayInRange(row.day, range.start, range.end)) continue;
    visitsBySource.set(row.channel, (visitsBySource.get(row.channel) ?? 0) + row.count);
    if (row.campaign) utm.set(row.campaign, (utm.get(row.campaign) ?? 0) + row.count);
  }
  const channelRows = new Map<string, AnalyticsReport["channels"][number]>();
  for (const order of current) {
    if (!isPaid(order.status)) continue;
    const key = order.channel ?? "";
    const row = channelRows.get(key) ?? { key, label: channelLabel(key), orders: 0, sales: 0, visits: 0 };
    row.orders += 1;
    row.sales += Number(order.total) || 0;
    channelRows.set(key, row);
  }
  for (const [key, count] of visitsBySource) {
    // Untagged visits land on the store directly, so they sit with "Online store".
    const channel = key || "online_store";
    const row = channelRows.get(channel) ?? { key: channel, label: channelLabel(channel), orders: 0, sales: 0, visits: 0 };
    row.visits += count;
    channelRows.set(channel, row);
  }
  const channels = [...channelRows.values()].sort((a, b) => bySales(a, b) || b.visits - a.visits);
  const sources = [...visitsBySource.entries()].map(([key, count]) => ({ key, label: sourceLabel(key), visits: count })).sort((a, b) => b.visits - a.visits);
  const utmCampaigns = [...utm.entries()].map(([key, count]) => ({ key, visits: count })).sort((a, b) => b.visits - a.visits);

  // New vs returning (paid orders in the period, by whether the buyer had paid before it started).
  const customers = { new: { customers: 0, orders: 0, sales: 0 }, returning: { customers: 0, orders: 0, sales: 0 } };
  const counted = new Set<string>();
  for (const order of current) {
    if (!isPaid(order.status)) continue;
    const key = customerKey(order.buyerEmail, order.buyerPhone);
    if (!key) continue;
    const first = firstPaid.get(key);
    const bucket = first !== undefined && first < range.start.getTime() ? customers.returning : customers.new;
    bucket.orders += 1;
    bucket.sales += Number(order.total) || 0;
    if (!counted.has(key)) {
      counted.add(key);
      bucket.customers += 1;
    }
  }

  // Marketing attribution from the ids saved on each paid order.
  const campaignName = new Map(input.campaigns.map((campaign) => [campaign.id, campaign.name]));
  const tokenCampaign = new Map(input.campaignTokens.map((row) => [row.token, row.campaignId]));
  const adById = new Map(input.ads.map((ad) => [ad.id, ad]));
  const affiliateById = new Map(input.affiliates.map((affiliate) => [affiliate.id, affiliate]));
  const email = new Map<string, AttributionRow>();
  const ads = new Map<string, AttributionRow>();
  const affiliates = new Map<string, AttributionRow>();
  const discounts = new Map<string, AttributionRow>();
  for (const order of current) {
    if (!isPaid(order.status)) continue;
    if (order.campaignToken) {
      const id = tokenCampaign.get(order.campaignToken) ?? "";
      addTo(email, id, () => ({ key: id, label: campaignName.get(id) ?? "Email (campaign removed)", orders: 0, sales: 0 }), order);
    }
    if (order.adCampaignId) {
      const ad = adById.get(order.adCampaignId);
      addTo(ads, order.adCampaignId, () => ({ key: order.adCampaignId!, label: ad?.headline ?? "Ad (removed)", sub: ad?.platform, orders: 0, sales: 0, extra: ad?.spend ?? 0 }), order);
    }
    if (order.affiliateId) {
      const affiliate = affiliateById.get(order.affiliateId);
      addTo(affiliates, order.affiliateId, () => ({ key: order.affiliateId!, label: affiliate?.name ?? "Creator (removed)", sub: affiliate?.code, orders: 0, sales: 0 }), order);
    }
    const code = order.discountCode?.trim().toUpperCase();
    if (code) addTo(discounts, code, () => ({ key: code, label: code, orders: 0, sales: 0 }), order, Number(order.discountAmount) || 0);
  }

  // Funnel: storefront counters, then orders placed online and paid.
  const online = current.filter((order) => !ONLINE_EXCLUDED.has(order.channel ?? ""));
  const funnelLabels: Record<FunnelMetric, string> = { visit: "Visits", product_view: "Product views", add_to_cart: "Added to bag", checkout_start: "Started checkout" };
  const funnel: AnalyticsReport["funnel"] = FUNNEL_METRICS.map((metric) => ({
    key: metric,
    label: funnelLabels[metric],
    count: sumMetric(input.metrics, metric, range.start, range.end),
    since: input.metricSince[metric] ?? null,
  }));
  funnel.push({ key: "placed", label: "Placed an order", count: online.length, since: null });
  funnel.push({ key: "paid", label: "Paid", count: online.filter((order) => isPaid(order.status)).length, since: null });

  return {
    kpis,
    previous: prev,
    change,
    series,
    topProducts,
    channels,
    sources,
    utmCampaigns,
    customers,
    attribution: {
      email: [...email.values()].sort(bySales),
      ads: [...ads.values()].sort(bySales),
      affiliates: [...affiliates.values()].sort(bySales),
      discounts: [...discounts.values()].sort(bySales),
    },
    funnel,
  };
}

/** CSV rows for the export: one table per section, separated by a blank row. */
export function analyticsCsvRows(report: AnalyticsReport, range: Pick<ResolvedRange, "fromDay" | "toDay" | "label">): unknown[][] {
  const pct = (value: number | null) => (value == null ? "" : (value * 100).toFixed(1));
  const k = report.kpis;
  const p = report.previous;
  const rows: unknown[][] = [
    ["Shopinbos analytics", range.label, `${range.fromDay} to ${range.toDay}`],
    [],
    ["Metric", "This period", "Previous period", "Change %"],
    ["Sales (NGN)", k.sales, p.sales, report.change.sales ?? ""],
    ["Paid orders", k.orders, p.orders, report.change.orders ?? ""],
    ["Average order (NGN)", Math.round(k.aov), Math.round(p.aov), report.change.aov ?? ""],
    ["Storefront visits", k.visits, p.visits, report.change.visits ?? ""],
    ["Conversion rate %", pct(k.conversionRate), pct(p.conversionRate), ""],
    ["Returning customer rate %", pct(k.returningRate), pct(p.returningRate), ""],
    ["Refunded or cancelled orders", k.refundsCount, p.refundsCount, report.change.refundsCount ?? ""],
    ["Refunded or cancelled value (NGN)", k.refundsValue, p.refundsValue, report.change.refundsValue ?? ""],
    [],
    ["Period", "Sales (NGN)", "Paid orders", "Visits", "Previous sales (NGN)", "Previous orders"],
    ...report.series.map((row) => [row.label, row.sales ?? "", row.orders ?? "", row.visits ?? "", row.previousSales, row.previousOrders]),
    [],
    ["Product", "Units sold", "Sales (NGN)", "Product views"],
    ...report.topProducts.map((row) => [row.name, row.quantity, row.sales, row.views ?? ""]),
    [],
    ["Channel", "Paid orders", "Sales (NGN)", "Visits"],
    ...report.channels.map((row) => [row.label, row.orders, row.sales, row.visits]),
    [],
    ["Attribution", "Name", "Paid orders", "Sales (NGN)", "Discount given or ad spend (NGN)"],
    ...report.attribution.email.map((row) => ["Email campaign", row.label, row.orders, row.sales, ""]),
    ...report.attribution.ads.map((row) => ["Ad", row.label, row.orders, row.sales, row.extra ?? ""]),
    ...report.attribution.affiliates.map((row) => ["Creator", row.label, row.orders, row.sales, ""]),
    ...report.attribution.discounts.map((row) => ["Discount code", row.label, row.orders, row.sales, row.extra ?? ""]),
    [],
    ["Funnel step", "Count"],
    ...report.funnel.map((row) => [row.label, row.count]),
  ];
  return rows;
}
