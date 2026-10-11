import { NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { toCsv } from "@/lib/csv";
import { analyticsCsvRows } from "@/lib/analytics/compute";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/range";

export const dynamic = "force-dynamic";

// CSV of /home/analytics for the same range: KPIs with the previous period, the time series, top products,
// channels, attribution and the funnel, one table after another.
export const GET = withSeller(async (req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, slug: true } });
  if (!store) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Store not found" } }, { status: 404 });

  const url = new URL(req.url);
  const range = resolveRange({ range: url.searchParams.get("range"), from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  if (range.error) return NextResponse.json({ error: { code: "BAD_REQUEST", message: range.error } }, { status: 400 });

  const { report } = await loadAnalytics(store.id, range);
  const csv = toCsv(analyticsCsvRows(report, range));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${store.slug}-analytics-${range.fromDay}-to-${range.toDay}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
