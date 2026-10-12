// Weekly summary emails (topic "weekly_summary"): the week window, the numbers, the ▲/▼ changes, the tip and the
// email body. Pure (no server imports) so tests/weekly-summary-product-news.test.mjs can run it; the data comes from
// weekly-summary.server.ts and the email goes out through the shared shell (buildPlatformEmail, kind "lifecycle").

import { DAY_MS, LAGOS_OFFSET_MS, lagosDayKey, lagosMidnight } from "../analytics/range.ts";
import { formatStoreMoney } from "../storefront/shopper-info.ts";
import { EMAIL_COLORS, FONT, MONO, escapeHtml, html, platformEmail, type PlatformLegal } from "./shell.ts";

// ─── The week ────────────────────────────────────────────────────────────────

export interface WeekWindow {
  /** Monday 00:00 Africa/Lagos (inclusive). */
  start: Date;
  /** The next Monday 00:00 Africa/Lagos (exclusive). */
  end: Date;
  /** The week before, for the ▲/▼ comparison. */
  previous: { start: Date; end: Date };
  /** YYYY-MM-DD of the Monday (Lagos): the de-duplication key with the user id. */
  weekStart: string;
  /** YYYY-MM-DD of the Sunday (Lagos). */
  weekEnd: string;
  /** "5–11 Oct" (or "29 Sep – 5 Oct"). */
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayParts(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function weekLabel(weekStart: string, weekEnd: string) {
  const a = dayParts(weekStart);
  const b = dayParts(weekEnd);
  if (a.month === b.month) return `${a.day}–${b.day} ${MONTHS[b.month - 1]}`;
  return `${a.day} ${MONTHS[a.month - 1]} – ${b.day} ${MONTHS[b.month - 1]}`;
}

/** The last complete Monday–Sunday week in Lagos time before `now` (on a Monday, the week that just ended). */
export function lastWeekWindow(now: Date): WeekWindow {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const sinceMonday = (lagos.getUTCDay() + 6) % 7;
  const today = lagosMidnight(lagosDayKey(now)) as Date;
  const thisMonday = new Date(today.getTime() - sinceMonday * DAY_MS);
  const start = new Date(thisMonday.getTime() - 7 * DAY_MS);
  const weekStart = lagosDayKey(start);
  const weekEnd = lagosDayKey(new Date(thisMonday.getTime() - DAY_MS));
  return {
    start,
    end: thisMonday,
    previous: { start: new Date(start.getTime() - 7 * DAY_MS), end: start },
    weekStart,
    weekEnd,
    label: weekLabel(weekStart, weekEnd),
  };
}

/** Whole days between two YYYY-MM-DD keys. */
export function daysBetween(fromKey: string, toKey: string) {
  const from = lagosMidnight(fromKey);
  const to = lagosMidnight(toKey);
  if (!from || !to) return Number.NaN;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** The row that stops a week going out twice: one per user and Monday. */
export function weeklySummaryKey(userId: string, weekStart: string) {
  return `${userId}:${weekStart}`;
}

// ─── Changes vs last week ─────────────────────────────────────────────────────

export interface Pair {
  current: number;
  previous: number;
}

/** Rounded % change, or null when last week was 0 and this week isn't (no meaningful %). */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export type ChangeDirection = "up" | "down" | "flat";

export interface Change {
  direction: ChangeDirection;
  /** "▲ 25% vs last week", "▼ 10% vs last week", "▲ New this week", "Same as last week". */
  text: string;
}

export function formatChange(current: number, previous: number): Change {
  const pct = percentChange(current, previous);
  if (pct === null) return { direction: "up", text: "▲ New this week" };
  if (pct === 0) return { direction: "flat", text: current ? "Same as last week" : "None last week either" };
  const size = Math.abs(pct) > 999 ? "999%+" : `${Math.abs(pct)}%`;
  return pct > 0 ? { direction: "up", text: `▲ ${size} vs last week` } : { direction: "down", text: `▼ ${size} vs last week` };
}

export function money(amount: number, currency = "NGN") {
  return formatStoreMoney(Math.round(amount || 0), currency || "NGN");
}

export function count(value: number) {
  return Math.round(value || 0).toLocaleString("en-NG");
}

// ─── The summaries ────────────────────────────────────────────────────────────

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

export interface SellerWeek {
  role: "seller";
  name: string;
  /** null when they haven't made a shop yet. */
  storeName: string | null;
  currency: string;
  orders: Pair;
  revenue: Pair;
  /** Storefront visits (StoreMetricDaily "visit"); null when the shop has never recorded one. */
  visits: Pair | null;
  subscribers: Pair;
  /** Carts left this week, and how many were won back (an order placed from the cart). */
  carts: { abandoned: number; recovered: number; recoveredValue: number };
  topProducts: TopProduct[];
}

export interface SupplierWeek {
  role: "supplier";
  name: string;
  businessName: string | null;
  currency: string;
  /** Wholesale + dropship orders received. */
  newOrders: Pair;
  wholesaleOrders: number;
  dropshipOrders: number;
  quotesAnswered: number;
  quotesOpen: number;
  newQuotes: number;
  /** Orders shipped this week (wholesale total + dropship cost). */
  earned: Pair;
  /** Earned but not marked paid yet, all time (supplier-orders/money.server.ts). */
  owed: number;
}

export interface LogisticsWeek {
  role: "logistics_partner";
  name: string;
  companyName: string | null;
  currency: string;
  completed: Pair;
  /** Deliveries that had an estimate, and how many arrived by it; null when none had one. */
  onTime: { onTime: number; total: number } | null;
  earnings: Pair;
  newJobs: number;
  failed: number;
}

export type WeeklySummary = SellerWeek | SupplierWeek | LogisticsWeek;

/** Anything happened at all this week? */
export function hasActivity(summary: WeeklySummary) {
  switch (summary.role) {
    case "seller":
      return summary.orders.current > 0 || summary.revenue.current > 0 || (summary.visits?.current ?? 0) > 0 || summary.subscribers.current > 0 || summary.carts.abandoned > 0 || summary.carts.recovered > 0;
    case "supplier":
      return summary.newOrders.current > 0 || summary.quotesAnswered > 0 || summary.newQuotes > 0 || summary.earned.current > 0;
    case "logistics_partner":
      return summary.completed.current > 0 || summary.newJobs > 0 || summary.failed > 0 || summary.earnings.current > 0;
  }
}

/** The quiet-week email goes at most once every 4 weeks. */
export const QUIET_EVERY_DAYS = 28;

export function quietWeekDue(lastQuietWeekStart: string | null | undefined, weekStart: string) {
  if (!lastQuietWeekStart) return true;
  const gap = daysBetween(lastQuietWeekStart, weekStart);
  return Number.isFinite(gap) && gap >= QUIET_EVERY_DAYS;
}

export type SummaryKind = "full" | "quiet" | "none";

/** What to send this week: the report, the short quiet-week note, or nothing. */
export function summaryKind(input: { active: boolean; lastQuietWeekStart: string | null | undefined; weekStart: string }): SummaryKind {
  if (input.active) return "full";
  return quietWeekDue(input.lastQuietWeekStart, input.weekStart) ? "quiet" : "none";
}

// ─── Tips (rules, no AI) ──────────────────────────────────────────────────────

export interface Tip {
  who: "Rex" | "Peggy";
  text: string;
}

export function sellerTip(week: SellerWeek): Tip {
  const visits = week.visits?.current ?? 0;
  const top = week.topProducts[0];
  if (visits >= 20 && week.orders.current === 0)
    return { who: "Peggy", text: `${count(visits)} people visited your shop but nobody ordered. Offer pay on delivery or a small first-order code so it's easier for them to say yes.` };
  if (week.carts.abandoned >= 2 && week.carts.recovered === 0)
    return { who: "Peggy", text: `${count(week.carts.abandoned)} carts were left behind. Turn on cart reminders in Marketing › Automations to win some of them back automatically.` };
  if (week.orders.previous > 0 && week.orders.current < week.orders.previous)
    return { who: "Rex", text: "Orders were down on last week. Send your subscribers a short offer with a clear end date, and post your best seller on WhatsApp status." };
  if (top) return { who: "Rex", text: `${top.name} was your best seller. Put it first in your shop, and keep enough stock for next week.` };
  if (week.subscribers.current > 0)
    return { who: "Peggy", text: `${count(week.subscribers.current)} new ${week.subscribers.current === 1 ? "person" : "people"} joined your list. A welcome email with a small code turns many of them into first orders.` };
  return { who: "Peggy", text: "Share your shop link on your WhatsApp status and Instagram bio. Most first orders come from people who already know you." };
}

export function supplierTip(week: SupplierWeek): Tip {
  if (week.quotesOpen > 0) return { who: "Rex", text: `You have ${count(week.quotesOpen)} open ${week.quotesOpen === 1 ? "quote" : "quotes"}. Sellers usually buy from whoever answers first, so reply within a day.` };
  if (week.owed > 0) return { who: "Rex", text: "Some shipped orders aren't marked as paid yet. Mark payouts as they arrive so your numbers stay right." };
  if (week.newOrders.current === 0) return { who: "Rex", text: "No new orders this week. Fresh photos and a clear minimum order quantity help sellers pick your products." };
  return { who: "Rex", text: "Keep stock levels up to date so sellers never order something you can't ship." };
}

export function logisticsTip(week: LogisticsWeek): Tip {
  const rate = week.onTime && week.onTime.total ? week.onTime.onTime / week.onTime.total : null;
  if (rate !== null && rate < 0.8) return { who: "Rex", text: "Some deliveries arrived after their estimate. Give a slightly longer estimate on busy routes; sellers prefer early to late." };
  if (week.failed > 0) return { who: "Rex", text: `${count(week.failed)} ${week.failed === 1 ? "delivery" : "deliveries"} failed. Ask riders to call the buyer before they set off; it saves most failed trips.` };
  if (week.completed.current === 0) return { who: "Rex", text: "No completed jobs this week. Check your coverage zones and prices so sellers can find and book you." };
  return { who: "Rex", text: "Ask happy sellers for a review. Partners with reviews get booked more." };
}

export function quietTip(summary: WeeklySummary): { text: string; cta: { label: string; path: string } } {
  if (summary.role === "seller") {
    if (!summary.storeName) return { text: "Your shop isn't set up yet. Chip can build it with you in a few minutes, then you can start sharing your link.", cta: { label: "Build my shop", path: "/home" } };
    return { text: "Add three products from the supplier marketplace. You don't hold stock: the supplier ships to your buyer, and you keep the margin.", cta: { label: "Find products to sell", path: "/marketplace" } };
  }
  if (summary.role === "supplier") return { text: "Add a few more products with clear photos and wholesale prices. Sellers search the marketplace every day.", cta: { label: "Open your dashboard", path: "/supplier/dashboard" } };
  return { text: "Add the areas you cover and your prices, so sellers near you can book you in one tap.", cta: { label: "Open your dashboard", path: "/logistics/dashboard" } };
}

// ─── The email ───────────────────────────────────────────────────────────────

const up = EMAIL_COLORS.teal;
const down = "#C2513A";

/** Dark-mode colours for the change lines (the shell's own rules cover cards, tiles and text). */
export const WEEKLY_EXTRA_CSS = `@media (prefers-color-scheme:dark){.sib-up{color:${EMAIL_COLORS.mint}!important}.sib-down{color:#F3A08E!important}.sib-tile{background:#0E2A38!important;border-color:#25455A!important}}
[data-ogsc] .sib-up{color:${EMAIL_COLORS.mint}!important}[data-ogsc] .sib-down{color:#F3A08E!important}[data-ogsb] .sib-tile{background:#0E2A38!important}
@media only screen and (max-width:420px){.sib-tile-value{font-size:20px!important}}`;

export interface Tile {
  label: string;
  value: string;
  change?: Change | null;
  note?: string | null;
}

function tileHtml(tile: Tile) {
  const change = tile.change
    ? `<p class="${tile.change.direction === "up" ? "sib-up" : tile.change.direction === "down" ? "sib-down" : "sib-muted"}" style="margin:6px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.35;font-weight:600;color:${tile.change.direction === "up" ? up : tile.change.direction === "down" ? down : EMAIL_COLORS.muted}">${escapeHtml(tile.change.text)}</p>`
    : "";
  const note = tile.note ? `<p class="sib-muted" style="margin:6px 0 0;font-family:${FONT};font-size:12.5px;line-height:1.35;color:${EMAIL_COLORS.muted}">${escapeHtml(tile.note)}</p>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sib-tile" bgcolor="${EMAIL_COLORS.soft}" style="border-collapse:separate;border-spacing:0;background:${EMAIL_COLORS.soft};border:1px solid ${EMAIL_COLORS.line};border-radius:14px"><tr><td style="padding:14px 14px 13px;font-family:${FONT}">
<p class="sib-muted" style="margin:0 0 6px;font-family:${MONO};font-size:10.5px;letter-spacing:0.12em;text-transform:uppercase;color:${EMAIL_COLORS.muted}">${escapeHtml(tile.label)}</p>
<p class="sib-ink sib-tile-value" style="margin:0;font-family:${FONT};font-size:24px;line-height:1.15;font-weight:700;letter-spacing:-0.4px;color:${EMAIL_COLORS.navy}">${escapeHtml(tile.value)}</p>${change}${note}
</td></tr></table>`;
}

/** Stat tiles, two to a row (tables, so they hold together in every client and on a 320px phone). */
export function statTiles(tiles: Tile[]) {
  const rows: string[] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    const pair = tiles.slice(i, i + 2);
    const cells = pair.map((tile, j) => `<td width="50%" valign="top" style="padding:0 ${j === 0 ? 5 : 0}px 10px ${j === 1 ? 5 : 0}px">${tileHtml(tile)}</td>`);
    if (pair.length === 1) cells.push('<td width="50%" style="padding:0 0 10px 5px"></td>');
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 10px">${rows.join("")}</table>`;
}

function tipHtml(tip: Tip) {
  return html.quote(
    `<p class="sib-eyebrow" style="margin:0 0 6px;font-family:${MONO};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.teal}">${escapeHtml(`${tip.who}'s tip`)}</p><p class="sib-ink" style="margin:0;color:${EMAIL_COLORS.navy}">${escapeHtml(tip.text)}</p>`,
  );
}

function sectionTitle(text: string) {
  return `<p class="sib-ink" style="margin:8px 0 4px;font-family:${FONT};font-size:15px;font-weight:700;color:${EMAIL_COLORS.navy}">${escapeHtml(text)}</p>`;
}

export interface RenderedSummary {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  bodyHtml: string;
  cta: { label: string; url: string };
  extraCss: string;
}

function first(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

export function renderWeeklySummary(summary: WeeklySummary, input: { appUrl: string; week: Pick<WeekWindow, "label">; kind?: "full" | "quiet" }): RenderedSummary {
  const base = input.appUrl.replace(/\/+$/, "");
  const eyebrow = `Your week · ${input.week.label}`;
  if (input.kind === "quiet") {
    const tip = quietTip(summary);
    return {
      subject: "A quiet week: here's one thing to try",
      preheader: tip.text.slice(0, 120),
      eyebrow,
      heading: "A quiet week",
      bodyHtml: `${html.p(`Hi ${first(summary.name)}, nothing much moved last week, so here's one thing worth trying instead of an empty report.`)}${html.quote(`<p class="sib-ink" style="margin:0;color:${EMAIL_COLORS.navy}">${escapeHtml(tip.text)}</p>`)}`,
      cta: { label: tip.cta.label, url: `${base}${tip.cta.path}` },
      extraCss: WEEKLY_EXTRA_CSS,
    };
  }

  if (summary.role === "seller") {
    const tiles: Tile[] = [
      { label: "Orders", value: count(summary.orders.current), change: formatChange(summary.orders.current, summary.orders.previous) },
      { label: "Revenue", value: money(summary.revenue.current, summary.currency), change: formatChange(summary.revenue.current, summary.revenue.previous) },
    ];
    if (summary.visits) tiles.push({ label: "Shop visits", value: count(summary.visits.current), change: formatChange(summary.visits.current, summary.visits.previous) });
    tiles.push({ label: "New subscribers", value: count(summary.subscribers.current), change: formatChange(summary.subscribers.current, summary.subscribers.previous) });
    if (summary.carts.abandoned || summary.carts.recovered)
      tiles.push({ label: "Carts won back", value: `${count(summary.carts.recovered)} of ${count(Math.max(summary.carts.abandoned, summary.carts.recovered))}`, note: summary.carts.recoveredValue ? `${money(summary.carts.recoveredValue, summary.currency)} recovered` : null });
    const top = summary.topProducts.slice(0, 3);
    const products = top.length
      ? `${sectionTitle("Top products")}${html.rows(top.map((p, i) => ({ label: `${i + 1}. ${p.name}`, value: `${count(p.quantity)} sold · ${money(p.revenue, summary.currency)}` })))}`
      : "";
    const shop = summary.storeName ?? "your shop";
    return {
      subject: `Your week at ${shop}: ${count(summary.orders.current)} ${summary.orders.current === 1 ? "order" : "orders"}, ${money(summary.revenue.current, summary.currency)}`,
      preheader: `${formatChange(summary.revenue.current, summary.revenue.previous).text.replace("vs last week", "on revenue vs last week")}. Your top products and one tip for this week.`,
      eyebrow,
      heading: `Your week at ${shop}`,
      bodyHtml: `${html.p(`Hi ${first(summary.name)}, here's how ${shop} did from Monday to Sunday.`)}${statTiles(tiles)}${products}${tipHtml(sellerTip(summary))}`,
      cta: { label: "Open your dashboard", url: `${base}/home` },
      extraCss: WEEKLY_EXTRA_CSS,
    };
  }

  if (summary.role === "supplier") {
    const tiles: Tile[] = [
      { label: "New orders", value: count(summary.newOrders.current), change: formatChange(summary.newOrders.current, summary.newOrders.previous), note: `${count(summary.wholesaleOrders)} wholesale · ${count(summary.dropshipOrders)} dropship` },
      { label: "Earned", value: money(summary.earned.current, summary.currency), change: formatChange(summary.earned.current, summary.earned.previous), note: "Orders shipped this week" },
      { label: "Quotes answered", value: count(summary.quotesAnswered), note: `${count(summary.newQuotes)} new this week` },
      { label: "Open quotes", value: count(summary.quotesOpen), note: summary.quotesOpen ? "Waiting for your reply" : "All answered" },
      { label: "Owed to you", value: money(summary.owed, summary.currency), note: "Shipped, not marked paid" },
    ];
    return {
      subject: `Your week on Shopinbos: ${count(summary.newOrders.current)} new ${summary.newOrders.current === 1 ? "order" : "orders"}, ${money(summary.earned.current, summary.currency)} earned`,
      preheader: `${count(summary.quotesOpen)} open ${summary.quotesOpen === 1 ? "quote" : "quotes"}, ${money(summary.owed, summary.currency)} owed to you, and one tip for this week.`,
      eyebrow,
      heading: summary.businessName ? `Your week at ${summary.businessName}` : "Your week as a supplier",
      bodyHtml: `${html.p(`Hi ${first(summary.name)}, here's your week as a Shopinbos supplier, Monday to Sunday.`)}${statTiles(tiles)}${tipHtml(supplierTip(summary))}`,
      cta: { label: "Open your dashboard", url: `${base}/supplier/dashboard` },
      extraCss: WEEKLY_EXTRA_CSS,
    };
  }

  const rate = summary.onTime && summary.onTime.total ? Math.round((summary.onTime.onTime / summary.onTime.total) * 100) : null;
  const tiles: Tile[] = [
    { label: "Jobs completed", value: count(summary.completed.current), change: formatChange(summary.completed.current, summary.completed.previous) },
    { label: "Earnings", value: money(summary.earnings.current, summary.currency), change: formatChange(summary.earnings.current, summary.earnings.previous) },
  ];
  if (rate !== null) tiles.push({ label: "On time", value: `${rate}%`, note: `${count(summary.onTime!.onTime)} of ${count(summary.onTime!.total)} by the estimate` });
  tiles.push({ label: "New jobs", value: count(summary.newJobs), note: summary.failed ? `${count(summary.failed)} failed` : null });
  return {
    subject: `Your week on Shopinbos: ${count(summary.completed.current)} ${summary.completed.current === 1 ? "delivery" : "deliveries"}, ${money(summary.earnings.current, summary.currency)}`,
    preheader: `${formatChange(summary.completed.current, summary.completed.previous).text}. Your earnings and one tip for this week.`,
    eyebrow,
    heading: summary.companyName ? `Your week at ${summary.companyName}` : "Your delivery week",
    bodyHtml: `${html.p(`Hi ${first(summary.name)}, here's your delivery week, Monday to Sunday.`)}${statTiles(tiles)}${tipHtml(logisticsTip(summary))}`,
    cta: { label: "Open your dashboard", url: `${base}/logistics/dashboard` },
    extraCss: WEEKLY_EXTRA_CSS,
  };
}

/** The whole email in the shell (previews, tests and screenshots; the cron builds it with buildPlatformEmail). */
export function weeklySummaryDocument(summary: WeeklySummary, input: { appUrl: string; week: Pick<WeekWindow, "label">; kind?: "full" | "quiet"; legal: PlatformLegal; reason: string; unsubscribeUrl?: string | null; preferencesUrl?: string | null }) {
  const r = renderWeeklySummary(summary, input);
  return {
    subject: r.subject,
    html: platformEmail({
      appUrl: input.appUrl,
      kind: "lifecycle",
      eyebrow: r.eyebrow,
      heading: r.heading,
      bodyHtml: r.bodyHtml,
      preheader: r.preheader,
      cta: r.cta,
      reason: input.reason,
      legal: input.legal,
      unsubscribeUrl: input.unsubscribeUrl,
      preferencesUrl: input.preferencesUrl,
      extraCss: r.extraCss,
    }),
  };
}
