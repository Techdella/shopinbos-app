import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sweepUnacceptedJobs } from "@/lib/delivery-market/jobs.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Logistics marketplace jobs a partner didn't accept in time (shared/delivery-market.ts ACCEPT_WITHIN_HOURS): the
// shop is told once, so it can send the job to another partner from its delivery exceptions. Nothing moves on its
// own. Called every 15 minutes (scripts/qstash-schedules.mjs) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await sweepUnacceptedJobs(new Date()) });
  } catch (error) {
    console.error("[cron delivery-jobs] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not check delivery jobs" } }, { status: 500 });
  }
}
