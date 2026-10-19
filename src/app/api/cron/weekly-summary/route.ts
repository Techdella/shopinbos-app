import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runWeeklySummaries } from "@/lib/email/weekly-summary.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly summaries (topic "weekly_summary"): last week's numbers (Mon–Sun, Africa/Lagos) for every seller, supplier
// and delivery partner who hasn't turned them off. Called by Supabase pg_cron on Mondays at 06:00 UTC (07:00 Lagos;
// docs/migrations/2026-10-16-weekly-summary-product-news.sql) with `Authorization: Bearer $CRON_SECRET`.
// Safe to call again: each user/week is claimed once (WeeklySummaryLog), and a call carries on where the last stopped.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const result = await runWeeklySummaries({ deadline: Date.now() + 240_000 });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron weekly-summary] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Weekly summary run failed" } }, { status: 500 });
  }
}
