import "server-only";

import { db } from "@/lib/db/client";
import { change, fillDays, retentionGrid, type CohortRow, type DayPoint } from "./pure";

// Admin › Analytics, from our own database: sign-ups, where leads come from and how many sign up, the
// sign-up → live store → first sale funnel, active users and weekly retention. Each part loads on its own, so a
// table that isn't there yet (before 2026-11-05-lead-growth.sql) only blanks its own section.

const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);

async function safe<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.warn("[admin analytics]", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function signupStats(days: number) {
  const since = new Date(Date.now() - days * DAY);
  const before = new Date(Date.now() - 2 * days * DAY);
  const [daily, byRole, previous, fromLeads] = await Promise.all([
    db.$queryRaw<Array<{ day: Date; n: number }>>`
      SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date AS day, count(*)::int AS n
      FROM "User" WHERE "createdAt" >= ${since} AND "role" <> 'admin' GROUP BY 1 ORDER BY 1`,
    db.user.groupBy({ by: ["role"], where: { createdAt: { gte: since }, role: { not: "admin" } }, _count: { _all: true } }),
    db.user.count({ where: { createdAt: { gte: before, lt: since }, role: { not: "admin" } } }),
    safe(() => db.websiteLead.count({ where: { convertedAt: { gte: since }, convertedUserId: { not: null } } })),
  ]);
  const total = byRole.reduce((sum, row) => sum + row._count._all, 0);
  const points: DayPoint[] = daily.map((row) => ({ date: iso(new Date(row.day)), value: row.n }));
  return {
    total,
    previous,
    change: change(total, previous),
    byRole: Object.fromEntries(byRole.map((row) => [row.role, row._count._all])) as Record<string, number>,
    fromLeads,
    series: fillDays(points, iso(since), iso(new Date())),
  };
}

export async function acquisitionStats(days: number) {
  return safe(async () => {
    const since = new Date(Date.now() - days * DAY);
    const [byKind, convertedByKind, bySource, byUtm, timeToConvert, leadsDaily] = await Promise.all([
      db.websiteLead.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      db.websiteLead.groupBy({ by: ["kind"], where: { createdAt: { gte: since }, convertedAt: { not: null } }, _count: { _all: true } }),
      db.$queryRaw<Array<{ label: string; leads: number; converted: number }>>`
        SELECT coalesce(nullif("source", ''), '(none)') AS label, count(*)::int AS leads, count("convertedAt")::int AS converted
        FROM "WebsiteLead" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      db.$queryRaw<Array<{ label: string; leads: number; converted: number }>>`
        SELECT coalesce(nullif("payload"->>'utm_source', ''), '(none)') || ' / ' || coalesce(nullif("payload"->>'utm_medium', ''), '(none)') AS label,
               count(*)::int AS leads, count("convertedAt")::int AS converted
        FROM "WebsiteLead" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
      db.$queryRaw<Array<{ median: number | null }>>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("convertedAt" - "createdAt")) / 86400)::float AS median
        FROM "WebsiteLead" WHERE "convertedAt" >= ${since} AND "convertedAt" > "createdAt"`,
      db.$queryRaw<Array<{ day: Date; n: number }>>`
        SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date AS day, count(*)::int AS n
        FROM "WebsiteLead" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    ]);
    const converted = new Map(convertedByKind.map((row) => [row.kind, row._count._all]));
    const kinds = byKind.map((row) => ({ label: row.kind, leads: row._count._all, converted: converted.get(row.kind) ?? 0 })).sort((a, b) => b.leads - a.leads);
    return {
      leads: kinds.reduce((sum, row) => sum + row.leads, 0),
      converted: kinds.reduce((sum, row) => sum + row.converted, 0),
      kinds,
      sources: bySource,
      utm: byUtm,
      medianDaysToSignUp: timeToConvert[0]?.median ?? null,
      series: fillDays(leadsDaily.map((row) => ({ date: iso(new Date(row.day)), value: row.n })), iso(since), iso(new Date())),
    };
  });
}

/** New sellers in the period and how far they got: store live, a product added, a first order. */
export async function sellerFunnel(days: number) {
  return safe(async () => {
    const since = new Date(Date.now() - days * DAY);
    const sellers = { role: "seller" as const, createdAt: { gte: since } };
    const [signedUp, live, withProduct, withOrder] = await Promise.all([
      db.user.count({ where: sellers }),
      db.store.count({ where: { user: sellers, onboardingState: "LIVE" } }),
      db.store.count({ where: { user: sellers, storeProducts: { some: {} } } }),
      db.store.count({ where: { user: sellers, retailOrders: { some: {} } } }),
    ]);
    return [
      { label: "Signed up", value: signedUp },
      { label: "Added a product", value: withProduct },
      { label: "Store live", value: live },
      { label: "First order", value: withOrder },
    ];
  });
}

/** Lead → contacted → signed up for leads that came in during the period. */
export async function leadFunnel(days: number) {
  return safe(async () => {
    const since = new Date(Date.now() - days * DAY);
    const [leads, messaged, converted] = await Promise.all([
      db.websiteLead.count({ where: { createdAt: { gte: since } } }),
      db.websiteLead.count({ where: { createdAt: { gte: since }, OR: [{ status: { not: "new" } }, { lastMessagedAt: { not: null } }] } }),
      db.websiteLead.count({ where: { createdAt: { gte: since }, convertedAt: { not: null } } }),
    ]);
    return [
      { label: "Leads", value: leads },
      { label: "Contacted", value: messaged },
      { label: "Signed up", value: converted },
    ];
  });
}

export async function messagingStats(days: number) {
  return safe(async () => {
    const since = new Date(Date.now() - days * DAY);
    const rows = await db.leadMessage.groupBy({ by: ["channel", "status"], where: { createdAt: { gte: since } }, _count: { _all: true } });
    const out: Record<string, { sent: number; failed: number; skipped: number }> = {};
    for (const row of rows) {
      out[row.channel] ??= { sent: 0, failed: 0, skipped: 0 };
      if (row.status === "sent" || row.status === "failed" || row.status === "skipped") out[row.channel][row.status] += row._count._all;
    }
    return out;
  });
}

/** DAU / WAU / MAU and a daily active series, from UserActivityDay. */
export async function activeUsers(days: number) {
  return safe(async () => {
    const since = new Date(Date.now() - days * DAY);
    const today = new Date(iso(new Date()));
    const [daily, dau, wau, mau] = await Promise.all([
      db.$queryRaw<Array<{ day: Date; n: number }>>`SELECT "day", count(*)::int AS n FROM "UserActivityDay" WHERE "day" >= ${since}::date GROUP BY 1 ORDER BY 1`,
      db.userActivityDay.count({ where: { day: today } }),
      db.$queryRaw<Array<{ n: number }>>`SELECT count(DISTINCT "userId")::int AS n FROM "UserActivityDay" WHERE "day" > ${new Date(Date.now() - 7 * DAY)}::date`,
      db.$queryRaw<Array<{ n: number }>>`SELECT count(DISTINCT "userId")::int AS n FROM "UserActivityDay" WHERE "day" > ${new Date(Date.now() - 30 * DAY)}::date`,
    ]);
    const m = mau[0]?.n ?? 0;
    return {
      dau,
      wau: wau[0]?.n ?? 0,
      mau: m,
      stickiness: m ? Math.round((dau / m) * 100) : null,
      series: fillDays(daily.map((row) => ({ date: iso(new Date(row.day)), value: row.n })), iso(since), iso(new Date())),
    };
  });
}

/** Weekly cohorts of sign-ups (last `weeks` weeks): the share who used the app 0, 1, 2… weeks later. */
export async function retention(weeks = 8): Promise<CohortRow[] | null> {
  return safe(async () => {
    const since = new Date(Date.now() - weeks * 7 * DAY);
    const [sizes, active] = await Promise.all([
      db.$queryRaw<Array<{ week: Date; size: number }>>`
        SELECT date_trunc('week', "createdAt")::date AS week, count(*)::int AS size
        FROM "User" WHERE "createdAt" >= date_trunc('week', ${since}::timestamp) AND "role" <> 'admin' GROUP BY 1`,
      db.$queryRaw<Array<{ week: Date; k: number; n: number }>>`
        WITH cohort AS (
          SELECT "id", date_trunc('week', "createdAt")::date AS week FROM "User"
          WHERE "createdAt" >= date_trunc('week', ${since}::timestamp) AND "role" <> 'admin'
        )
        SELECT c.week, ((date_trunc('week', a."day")::date - c.week) / 7)::int AS k, count(DISTINCT a."userId")::int AS n
        FROM cohort c JOIN "UserActivityDay" a ON a."userId" = c."id"
        WHERE a."day" >= c.week
        GROUP BY 1, 2`,
    ]);
    return retentionGrid(
      sizes.map((row) => ({ week: iso(new Date(row.week)), size: row.size })),
      active.map((row) => ({ week: iso(new Date(row.week)), k: row.k, n: row.n })),
      weeks,
      iso(new Date()),
    );
  });
}
