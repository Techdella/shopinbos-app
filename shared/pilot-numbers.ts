// Pilot numbers for each shop (the founder's "what to measure" list for Shopinbos Business + Plug): customers who
// joined Plug from the shop's link or QR, repeat buyers, sales from resell links, and views and sales per video.
// Pure, shared by the seller page (/home/pilot-numbers and the phone's pilot-numbers screen), the admin overview
// (/admin/pilot-numbers + CSV) and the tests (tests/pilot-numbers.test.mjs). The server side is
// src/lib/pilot-numbers.server.ts; link and QR visits are counted per day in "ShopLinkHit"
// (docs/migrations/2026-12-16-payout-ledger.sql) by the short-link redirect (src/app/h/[handle]/route.ts).
//
// Honest numbers only: video "sales" are orders for the video's product placed since the video went up, not sales
// we can prove the video made. Plug joins are 0 until Plug launches.

/** The pilot features that make a shop a pilot shop (any one on shows the numbers). */
export const PILOT_NUMBER_FEATURES = ["post_to_plug", "resell", "notify_followers", "plug_follow_card"] as const;

/** Are the pilot numbers shown for an account with these features on? */
export function pilotNumbersOn(features: Iterable<string>): boolean {
  const on = new Set(features);
  return PILOT_NUMBER_FEATURES.some((key) => on.has(key));
}

// ─── Link and QR visits ───────────────────────────────────────────────────────

export const SHOP_LINK_SOURCES = ["link", "qr"] as const;
export type ShopLinkSource = (typeof SHOP_LINK_SOURCES)[number];

/** Where a short-link visit came from: ?src=qr is the QR code (the share card adds it), anything else the link. */
export function shopLinkSource(src: string | null | undefined): ShopLinkSource {
  return String(src ?? "").trim().toLowerCase() === "qr" ? "qr" : "link";
}

/** Link previews (WhatsApp, Facebook, Slack…) and crawlers fetch links too: not visits. */
export const LINK_PREVIEW_AGENTS = /bot|crawler|spider|facebookexternalhit|whatsapp|slackbot|telegrambot|twitterbot|linkedinbot|discordbot|preview|headless/i;

export function isLinkPreview(userAgent: string | null | undefined): boolean {
  return !userAgent || LINK_PREVIEW_AGENTS.test(userAgent);
}

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Lagos calendar day ("YYYY-MM-DD") a visit counts on. */
export function lagosHitDay(now: Date): string {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** The first day of the last `days` days, today included ("YYYY-MM-DD", Lagos). */
export function windowStartDay(now: Date, days: number): string {
  return new Date(Date.parse(`${lagosHitDay(now)}T00:00:00Z`) - (Math.max(1, days) - 1) * DAY_MS).toISOString().slice(0, 10);
}

export interface HitRow {
  day: string | Date;
  source: string;
  count: number;
}

const dayText = (day: string | Date) => (typeof day === "string" ? day.slice(0, 10) : day.toISOString().slice(0, 10));

/** Link and QR visits in the last 7 and 30 days (today included). */
export function visitTotals(rows: readonly HitRow[], now: Date) {
  const since7 = windowStartDay(now, 7);
  const since30 = windowStartDay(now, 30);
  const out = { link7: 0, qr7: 0, link30: 0, qr30: 0, total7: 0, total30: 0 };
  for (const row of rows) {
    const day = dayText(row.day);
    const count = Math.max(0, Math.floor(Number(row.count) || 0));
    const qr = row.source === "qr";
    if (day >= since30) {
      out.total30 += count;
      if (qr) out.qr30 += count;
      else out.link30 += count;
    }
    if (day >= since7) {
      out.total7 += count;
      if (qr) out.qr7 += count;
      else out.link7 += count;
    }
  }
  return out;
}

// ─── Buyers ───────────────────────────────────────────────────────────────────

/** A repeat buyer has ordered from the shop at least twice. */
export const REPEAT_BUYER_ORDERS = 2;

export function repeatBuyers(rows: readonly { orderCount: number }[]) {
  let buyers = 0;
  let repeat = 0;
  for (const row of rows) {
    const count = Math.max(0, Number(row.orderCount) || 0);
    if (count < 1) continue;
    buyers += 1;
    if (count >= REPEAT_BUYER_ORDERS) repeat += 1;
  }
  return { buyers, repeat };
}

// ─── Followers ────────────────────────────────────────────────────────────────

/**
 * Followers still following, and how many came from the link, the QR code or Plug (not just from buying). A row is
 * one follower, or a group of `count` followers with the same source (a database group-by).
 */
export function followerTotals(rows: readonly { source: string; unfollowedAt: Date | string | null; count?: number }[]) {
  const out = { total: 0, fromLink: 0, fromQr: 0, fromPlug: 0, fromOrders: 0 };
  for (const row of rows) {
    if (row.unfollowedAt) continue;
    const n = row.count === undefined ? 1 : Math.max(0, Math.floor(Number(row.count) || 0));
    out.total += n;
    if (row.source === "link") out.fromLink += n;
    else if (row.source === "qr") out.fromQr += n;
    else if (row.source === "plug") out.fromPlug += n;
    else out.fromOrders += n;
  }
  return out;
}

/** Customers who joined Plug from the shop's link or QR: followers whose source is Plug, counted only once Plug is live. */
export function plugJoins(followers: { fromPlug: number }, plugLive: boolean): number {
  return plugLive ? followers.fromPlug : 0;
}

// ─── Resell ───────────────────────────────────────────────────────────────────

/** Sales from resell links: counted once the order is paid (void and unpaid ones left out). */
export function resellSaleTotals(rows: readonly { status: string; lineTotal: number; commissionAmount: number }[]) {
  const out = { sales: 0, value: 0, commission: 0 };
  for (const row of rows) {
    if (row.status === "void" || row.status === "awaiting_payment") continue;
    out.sales += 1;
    out.value += Math.max(0, Number(row.lineTotal) || 0);
    out.commission += Math.max(0, Number(row.commissionAmount) || 0);
  }
  return out;
}

// ─── Videos ───────────────────────────────────────────────────────────────────

export interface VideoForNumbers {
  id: string;
  productId: string;
  caption: string;
  views: number;
  createdAt: Date | string;
}

export interface OrderForNumbers {
  createdAt: Date | string;
  productIds: readonly string[];
}

const time = (value: Date | string) => (typeof value === "string" ? Date.parse(value) : value.getTime());

/**
 * The shop's videos, most viewed first (at most `limit`), each with the orders for its product placed since the video
 * went up ("orders for this product since the video went up": not proof the video made them).
 */
export function topVideos<V extends VideoForNumbers>(videos: readonly V[], orders: readonly OrderForNumbers[], limit = 5) {
  return [...videos]
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0) || time(b.createdAt) - time(a.createdAt))
    .slice(0, limit)
    .map((video) => {
      const since = time(video.createdAt);
      const ordersSince = orders.filter((order) => time(order.createdAt) >= since && order.productIds.includes(video.productId)).length;
      return { ...video, views: Math.max(0, Number(video.views) || 0), ordersSince };
    });
}

/** The product ids in an order's items (RetailOrder.items: [{ productId, … }]). */
export function orderProductIds(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const ids = new Set<string>();
  for (const item of items) {
    const id = (item as { productId?: unknown } | null)?.productId;
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

// ─── Everything for one shop ──────────────────────────────────────────────────

export interface PilotNumbers {
  plugLive: boolean;
  /** Customers who joined Plug from the shop's link or QR code: 0 until Plug launches. */
  plugJoins: number;
  visits: ReturnType<typeof visitTotals>;
  followers: ReturnType<typeof followerTotals>;
  buyers: ReturnType<typeof repeatBuyers>;
  resell: ReturnType<typeof resellSaleTotals>;
  videos: Array<{ id: string; productId: string; productName: string; caption: string; views: number; ordersSince: number; createdAt: string }>;
  videoViews: number;
}

export const PILOT_CSV_HEAD = [
  "Shop",
  "Handle",
  "Link visits (7 days)",
  "QR visits (7 days)",
  "Link visits (30 days)",
  "QR visits (30 days)",
  "Plug joins",
  "Followers",
  "Followers from link or QR",
  "Buyers",
  "Repeat buyers",
  "Resell sales",
  "Resell sales value (NGN)",
  "Resell commission (NGN)",
  "Videos",
  "Video views",
  "Top video",
  "Top video views",
  "Orders for top video's product since it went up",
] as const;

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function pilotCsv(rows: readonly { shopName: string; handle: string | null; numbers: PilotNumbers; videoCount: number }[]): string {
  const out = [PILOT_CSV_HEAD.map(csvCell).join(",")];
  for (const row of rows) {
    const n = row.numbers;
    const top = n.videos[0];
    out.push(
      [
        row.shopName,
        row.handle ?? "", // without the "@" (a leading "@" reads as a formula in spreadsheets)
        n.visits.link7,
        n.visits.qr7,
        n.visits.link30,
        n.visits.qr30,
        n.plugLive ? n.plugJoins : "Starts when Plug launches",
        n.followers.total,
        n.followers.fromLink + n.followers.fromQr,
        n.buyers.buyers,
        n.buyers.repeat,
        n.resell.sales,
        n.resell.value,
        n.resell.commission,
        row.videoCount,
        n.videoViews,
        top ? top.productName || top.caption : "",
        top ? top.views : "",
        top ? top.ordersSince : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return out.join("\r\n");
}
