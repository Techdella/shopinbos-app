import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runPushCampaignsCron } from "@/lib/push-campaigns/campaigns.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Push center (/admin/push): starts scheduled campaigns that are due (each row is claimed scheduled → sending once,
// so two overlapping runs never start it twice), carries on big ones in batches, and refreshes the counts of recent
// ones. Every 5 minutes from QStash (scripts/qstash-schedules.mjs) or Supabase pg_cron
// (docs/migrations/2026-11-30-push-center.sql) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await runPushCampaignsCron(new Date(), Date.now() + 240_000) });
  } catch (error) {
    console.error("[cron push-campaigns] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Push campaigns run failed" } }, { status: 500 });
  }
}
