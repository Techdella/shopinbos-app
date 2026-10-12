import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { runWeeklySummaries } from "@/lib/email/weekly-summary.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly summaries (topic "weekly_summary"): last week's numbers (Mon–Sun, Africa/Lagos) for every seller, supplier
// and delivery partner who hasn't turned them off. Called by Supabase pg_cron on Mondays at 06:00 UTC (07:00 Lagos;
// docs/migrations/2026-10-16-weekly-summary-product-news.sql) with `Authorization: Bearer $CRON_SECRET`.
// Safe to call again: each user/week is claimed once (WeeklySummaryLog), and a call carries on where the last stopped.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const result = await runWeeklySummaries({ deadline: Date.now() + 240_000 });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron weekly-summary] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Weekly summary run failed" } }, { status: 500 });
  }
}
