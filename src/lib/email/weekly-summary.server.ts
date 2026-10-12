import "server-only";

import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { lagosDayKey } from "@/lib/analytics/range";
import { sendEmailBatch, type BatchEmail } from "@/lib/notifications/resend";
import { supplierEarnings } from "@/lib/supplier-orders/money.server";
import { SUPPLIER_EARNED_STATUSES } from "@/lib/supplier-orders/pure";
import { appBase, buildPlatformEmail } from "./compliance.server";
import { platformEventKey } from "./preferences";
import {
  hasActivity,
  lastWeekWindow,
  renderWeeklySummary,
  summaryKind,
  type LogisticsWeek,
  type Pair,
  type SellerWeek,
  type SummaryKind,
  type SupplierWeek,
  type TopProduct,
  type WeekWindow,
  type WeeklySummary,
} from "./weekly-summary";

// The weekly summary run (GET /api/cron/weekly-summary, Mondays 07:00 Lagos): last week's numbers for every seller,
// supplier and delivery partner who hasn't turned off "Weekly summaries".
//
// No duplicates: each user/week gets a WeeklySummaryLog row (unique userId + weekStart), inserted with
// ON CONFLICT DO NOTHING before anything is sent; only the run whose insert succeeded sends. A row stuck in
// "claimed" (the run died mid-send) is never retried, because the email may already have gone. A batch the
// provider refused ("failed") is retried by a later run, up to 3 attempts.
// Bounded: at most WEEKLY_SUMMARY_MAX_PER_RUN users per call (default 300), in batches of 50; the next call
// carries on with whoever has no row yet.

const ROLES = ["seller", "supplier", "logistics_partner"] as const;
type SummaryRole = (typeof ROLES)[number];
const BATCH = 50;
const MAX_ATTEMPTS = 3;

function pair(current: number, previous: number): Pair {
  return { current: Math.round(current * 100) / 100, previous: Math.round(previous * 100) / 100 };
}

const inWeek = (week: WeekWindow) => ({ gte: week.start, lt: week.end });
const inPrevious = (week: WeekWindow) => ({ gte: week.previous.start, lt: week.previous.end });

// ─── Numbers ─────────────────────────────────────────────────────────────────

function topProducts(orders: Array<{ items: unknown }>): TopProduct[] {
  const stats = new Map<string, TopProduct>();
  for (const order of orders) {
    for (const raw of Array.isArray(order.items) ? order.items : []) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const name = String(item.name ?? item.title ?? "Product").slice(0, 80);
      const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
      const price = Number(item.price ?? item.unitPrice ?? 0) || 0;
      const row = stats.get(name) ?? { name, quantity: 0, revenue: 0 };
      row.quantity += quantity;
      row.revenue += price * quantity;
      stats.set(name, row);
    }
  }
  return [...stats.values()].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity).slice(0, 3);
}

export async function sellerWeek(user: { id: string; name: string }, week: WeekWindow): Promise<SellerWeek> {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, currency: true } });
  const empty: SellerWeek = { role: "seller", name: user.name, storeName: store?.name ?? null, currency: store?.currency ?? "NGN", orders: pair(0, 0), revenue: pair(0, 0), visits: null, subscribers: pair(0, 0), carts: { abandoned: 0, recovered: 0, recoveredValue: 0 }, topProducts: [] };
  if (!store) return empty;
  const storeId = store.id;
  const paid = { in: [...PAID_ORDER_STATUSES] };
  const [orders, visitRows, subsNow, subsBefore, abandoned, recovered] = await Promise.all([
    db.retailOrder.findMany({ where: { storeId, status: paid, createdAt: { gte: week.previous.start, lt: week.end } }, select: { total: true, createdAt: true, items: true } }),
    db.storeMetricDaily.findMany({ where: { storeId, metric: "visit", day: { gte: lagosDayKey(week.previous.start), lte: week.weekEnd } }, select: { day: true, count: true } }),
    db.subscriber.count({ where: { storeId, createdAt: inWeek(week) } }),
    db.subscriber.count({ where: { storeId, createdAt: inPrevious(week) } }),
    db.abandonedCartEvent.count({ where: { storeId, createdAt: inWeek(week) } }),
    db.abandonedCartEvent.aggregate({ where: { storeId, recoveredAt: inWeek(week) }, _count: { _all: true }, _sum: { subtotal: true } }),
  ]);
  const current = orders.filter((o) => o.createdAt >= week.start);
  const previous = orders.filter((o) => o.createdAt < week.start);
  const sum = (list: Array<{ total: number }>) => list.reduce((total, o) => total + Number(o.total || 0), 0);
  let visits: Pair | null = null;
  const visitsNow = visitRows.filter((r) => r.day >= week.weekStart).reduce((t, r) => t + r.count, 0);
  const visitsBefore = visitRows.filter((r) => r.day < week.weekStart).reduce((t, r) => t + r.count, 0);
  if (visitsNow || visitsBefore) visits = pair(visitsNow, visitsBefore);
  else if (await db.storeMetricDaily.findFirst({ where: { storeId, metric: "visit" }, select: { id: true } })) visits = pair(0, 0);
  return {
    ...empty,
    orders: pair(current.length, previous.length),
    revenue: pair(sum(current), sum(previous)),
    visits,
    subscribers: pair(subsNow, subsBefore),
    carts: { abandoned, recovered: recovered._count._all, recoveredValue: recovered._sum.subtotal ?? 0 },
    topProducts: topProducts(current),
  };
}

export async function supplierWeek(user: { id: string; name: string }, week: WeekWindow): Promise<SupplierWeek> {
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true, businessName: true, displayName: true } });
  const base: SupplierWeek = { role: "supplier", name: user.name, businessName: supplier?.displayName || supplier?.businessName || null, currency: "NGN", newOrders: pair(0, 0), wholesaleOrders: 0, dropshipOrders: 0, quotesAnswered: 0, quotesOpen: 0, newQuotes: 0, earned: pair(0, 0), owed: 0 };
  if (!supplier) return base;
  const supplierId = supplier.id;
  const earned = { in: [...SUPPLIER_EARNED_STATUSES] };
  const [wNow, wBefore, dNow, dBefore, answered, open, newQuotes, wEarnedNow, wEarnedBefore, dEarnedNow, dEarnedBefore, money] = await Promise.all([
    db.wholesaleOrder.count({ where: { supplierId, createdAt: inWeek(week) } }),
    db.wholesaleOrder.count({ where: { supplierId, createdAt: inPrevious(week) } }),
    db.supplierOrder.count({ where: { supplierId, createdAt: inWeek(week) } }),
    db.supplierOrder.count({ where: { supplierId, createdAt: inPrevious(week) } }),
    db.supplierQuoteRequest.count({ where: { supplierId, updatedAt: inWeek(week), status: { not: "pending" }, OR: [{ quotedPrice: { not: null } }, { supplierResponse: { not: null } }] } }),
    db.supplierQuoteRequest.count({ where: { supplierId, status: "pending" } }),
    db.supplierQuoteRequest.count({ where: { supplierId, createdAt: inWeek(week) } }),
    db.wholesaleOrder.aggregate({ where: { supplierId, status: earned, shippedAt: inWeek(week) }, _sum: { totalPrice: true } }),
    db.wholesaleOrder.aggregate({ where: { supplierId, status: earned, shippedAt: inPrevious(week) }, _sum: { totalPrice: true } }),
    db.supplierOrder.aggregate({ where: { supplierId, status: earned, shippedAt: inWeek(week) }, _sum: { costTotal: true } }),
    db.supplierOrder.aggregate({ where: { supplierId, status: earned, shippedAt: inPrevious(week) }, _sum: { costTotal: true } }),
    supplierEarnings(supplierId),
  ]);
  return {
    ...base,
    newOrders: pair(wNow + dNow, wBefore + dBefore),
    wholesaleOrders: wNow,
    dropshipOrders: dNow,
    quotesAnswered: answered,
    quotesOpen: open,
    newQuotes,
    earned: pair((wEarnedNow._sum.totalPrice ?? 0) + (dEarnedNow._sum.costTotal ?? 0), (wEarnedBefore._sum.totalPrice ?? 0) + (dEarnedBefore._sum.costTotal ?? 0)),
    owed: money.owed,
  };
}

export async function logisticsWeek(user: { id: string; name: string }, week: WeekWindow): Promise<LogisticsWeek> {
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true, companyName: true, displayName: true } });
  const base: LogisticsWeek = { role: "logistics_partner", name: user.name, companyName: partner?.displayName || partner?.companyName || null, currency: "NGN", completed: pair(0, 0), onTime: null, earnings: pair(0, 0), newJobs: 0, failed: 0 };
  if (!partner) return base;
  const logisticsPartnerId = partner.id;
  const [delivered, newJobs, failed] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId, status: "delivered", deliveredAt: { gte: week.previous.start, lt: week.end } },
      select: { deliveredAt: true, estimatedDelivery: true, netAmount: true, deliveryFee: true, platformFee: true, currency: true },
    }),
    db.deliveryBooking.count({ where: { logisticsPartnerId, createdAt: inWeek(week) } }),
    db.deliveryBooking.count({ where: { logisticsPartnerId, status: "failed", updatedAt: inWeek(week) } }),
  ]);
  const current = delivered.filter((b) => b.deliveredAt! >= week.start);
  const previous = delivered.filter((b) => b.deliveredAt! < week.start);
  const earning = (b: (typeof delivered)[number]) => (b.netAmount > 0 ? b.netAmount : Math.max(0, b.deliveryFee - b.platformFee));
  const sum = (list: typeof delivered) => list.reduce((t, b) => t + earning(b), 0);
  const estimated = current.filter((b) => b.estimatedDelivery);
  return {
    ...base,
    currency: current[0]?.currency ?? "NGN",
    completed: pair(current.length, previous.length),
    onTime: estimated.length ? { onTime: estimated.filter((b) => b.deliveredAt! <= b.estimatedDelivery!).length, total: estimated.length } : null,
    earnings: pair(sum(current), sum(previous)),
    newJobs,
    failed,
  };
}

export async function weeklySummaryFor(user: { id: string; name: string; role: string }, week: WeekWindow): Promise<WeeklySummary | null> {
  if (user.role === "seller") return sellerWeek(user, week);
  if (user.role === "supplier") return supplierWeek(user, week);
  if (user.role === "logistics_partner") return logisticsWeek(user, week);
  return null;
}

// ─── The run ─────────────────────────────────────────────────────────────────

interface Candidate {
  id: string;
  email: string;
  name: string;
  role: SummaryRole;
}

/** Users with no row for this week yet, who haven't turned weekly summaries off. */
async function nextCandidates(week: WeekWindow, take: number): Promise<Candidate[]> {
  const eventKey = platformEventKey("weekly_summary");
  return db.$queryRaw<Candidate[]>`
    SELECT u."id", u."email", u."name", u."role"::text AS "role"
    FROM "User" u
    WHERE u."role"::text IN ('seller', 'supplier', 'logistics_partner')
      AND u."email" IS NOT NULL AND u."email" <> ''
      AND u."createdAt" < ${week.end}
      AND NOT EXISTS (SELECT 1 FROM "WeeklySummaryLog" l WHERE l."userId" = u."id" AND l."weekStart" = ${week.weekStart})
      AND NOT EXISTS (
        SELECT 1 FROM "NotificationPreference" p
        WHERE p."userId" = u."id" AND p."category"::text = 'system' AND p."eventKey" = ${eventKey} AND p."email" = false
      )
    ORDER BY u."id"
    LIMIT ${take}`;
}

/** Claims rows: only the users whose row this call inserted come back (ON CONFLICT DO NOTHING). */
async function claim(week: WeekWindow, users: Candidate[]) {
  if (!users.length) return new Set<string>();
  const rows = await db.weeklySummaryLog.createManyAndReturn({
    data: users.map((user) => ({ userId: user.id, weekStart: week.weekStart, role: user.role, status: "claimed" })),
    skipDuplicates: true,
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
}

/** Failed batches from earlier calls this week, re-claimed one by one (status failed → claimed is atomic). */
async function reclaimFailed(week: WeekWindow, take: number): Promise<Candidate[]> {
  const failed = await db.weeklySummaryLog.findMany({ where: { weekStart: week.weekStart, status: "failed", attempts: { lt: MAX_ATTEMPTS } }, take, orderBy: { userId: "asc" }, select: { id: true, userId: true } });
  if (!failed.length) return [];
  const owned: string[] = [];
  for (const row of failed) {
    const moved = await db.weeklySummaryLog.updateMany({ where: { id: row.id, status: "failed" }, data: { status: "claimed", attempts: { increment: 1 }, error: null } });
    if (moved.count === 1) owned.push(row.userId);
  }
  if (!owned.length) return [];
  const users = await db.user.findMany({ where: { id: { in: owned }, email: { not: null } }, select: { id: true, email: true, name: true, role: true } });
  return users.map((user) => ({ id: user.id, email: user.email!, name: user.name, role: user.role as SummaryRole }));
}

export interface WeeklySummaryRunResult {
  weekStart: string;
  claimed: number;
  sent: number;
  quiet: number;
  skipped: number;
  failed: number;
  more: boolean;
  errors: string[];
}

export async function runWeeklySummaries(options: { now?: Date; maxPerRun?: number; deadline?: number } = {}): Promise<WeeklySummaryRunResult> {
  const now = options.now ?? new Date();
  const week = lastWeekWindow(now);
  const maxPerRun = Math.max(1, Math.min(5000, options.maxPerRun ?? (Number(process.env.WEEKLY_SUMMARY_MAX_PER_RUN) || 300)));
  const deadline = options.deadline ?? Date.now() + 240_000;
  const result: WeeklySummaryRunResult = { weekStart: week.weekStart, claimed: 0, sent: 0, quiet: 0, skipped: 0, failed: 0, more: false, errors: [] };
  const appUrl = appBase();

  let retriedFailed = false;
  while (result.claimed < maxPerRun && Date.now() < deadline) {
    const take = Math.min(BATCH, maxPerRun - result.claimed);
    let batch: Candidate[] = [];
    if (!retriedFailed) {
      batch = await reclaimFailed(week, take);
      retriedFailed = batch.length < take;
    }
    if (!batch.length) {
      const candidates = await nextCandidates(week, take);
      if (!candidates.length) break;
      const owned = await claim(week, candidates);
      batch = candidates.filter((user) => owned.has(user.id));
      if (!batch.length) continue; // another run took all of them; look again
    }
    result.claimed += batch.length;

    // The last quiet-week email each user got (at most one every 4 weeks).
    const quietRows = await db.weeklySummaryLog.groupBy({ by: ["userId"], where: { userId: { in: batch.map((u) => u.id) }, kind: "quiet", status: "sent" }, _max: { weekStart: true } });
    const lastQuiet = new Map(quietRows.map((row) => [row.userId, row._max.weekStart]));

    const outgoing: Array<{ user: Candidate; kind: SummaryKind; email: BatchEmail }> = [];
    for (const user of batch) {
      try {
        const summary = await weeklySummaryFor(user, week);
        const kind = summary ? summaryKind({ active: hasActivity(summary), lastQuietWeekStart: lastQuiet.get(user.id) ?? null, weekStart: week.weekStart }) : "none";
        if (!summary || kind === "none") {
          await db.weeklySummaryLog.update({ where: { userId_weekStart: { userId: user.id, weekStart: week.weekStart } }, data: { status: "skipped", kind: "none" } });
          result.skipped += 1;
          continue;
        }
        const rendered = renderWeeklySummary(summary, { appUrl, week, kind });
        const built = buildPlatformEmail({
          user: { id: user.id, role: user.role },
          kind: "lifecycle",
          topic: "weekly_summary",
          heading: rendered.heading,
          eyebrow: rendered.eyebrow,
          bodyHtml: rendered.bodyHtml,
          preheader: rendered.preheader,
          cta: rendered.cta,
          extraCss: rendered.extraCss,
        });
        outgoing.push({ user, kind, email: { to: user.email, subject: rendered.subject, html: built.html, headers: built.headers } });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${user.id}: ${message}`);
        await db.weeklySummaryLog.update({ where: { userId_weekStart: { userId: user.id, weekStart: week.weekStart } }, data: { status: "failed", error: message.slice(0, 500) } }).catch(() => null);
        result.failed += 1;
      }
    }

    if (outgoing.length) {
      const sent = await sendEmailBatch(outgoing.map((item) => item.email));
      const where = (kind: SummaryKind) => ({ weekStart: week.weekStart, status: "claimed", userId: { in: outgoing.filter((item) => item.kind === kind).map((item) => item.user.id) } });
      if (sent.success) {
        const at = new Date();
        await db.weeklySummaryLog.updateMany({ where: where("full"), data: { status: "sent", kind: "full", sentAt: at } });
        await db.weeklySummaryLog.updateMany({ where: where("quiet"), data: { status: "sent", kind: "quiet", sentAt: at } });
        result.sent += outgoing.filter((item) => item.kind === "full").length;
        result.quiet += outgoing.filter((item) => item.kind === "quiet").length;
      } else {
        const error = (sent.message ?? "The email provider refused the batch").slice(0, 500);
        await db.weeklySummaryLog.updateMany({ where: { weekStart: week.weekStart, status: "claimed", userId: { in: outgoing.map((item) => item.user.id) } }, data: { status: "failed", error } });
        result.failed += outgoing.length;
        result.errors.push(error);
        break; // a refused batch is usually systemic (domain, quota): stop and let the next call retry
      }
    }
  }
  result.more = result.claimed >= maxPerRun || Date.now() >= deadline;
  return result;
}
