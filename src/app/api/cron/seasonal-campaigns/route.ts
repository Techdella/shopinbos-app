import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { runCampaignJobs } from "@/lib/store-campaigns/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Seasonal campaigns' start/end side effects and the safety sweep: switches linked discounts on at the start and off at
// the end (when the seller asked), tells the seller a campaign went live, is ending soon or ended (with sales), and
// catches any boundary a late run missed. The storefront itself never waits for this: a campaign's status comes from
// its dates. Idempotent (each job is claimed once). Called every 5 minutes by Supabase pg_cron
// (docs/migrations/2026-10-30-campaigns.sql) with `Authorization: Bearer $CRON_SECRET`. /api/cron/campaigns is the
// email broadcast sender, a different job.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const result = await runCampaignJobs(new Date());
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron seasonal-campaigns] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not run the campaign jobs" } }, { status: 500 });
  }
}
