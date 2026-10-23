import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runReferralJob } from "@/lib/referrals/service.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Refer & earn, hourly (QStash, docs/qstash.md): invites that now count get their reward, ones that never counted
// in 120 days are closed, and free plan time that started or ended is applied.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await runReferralJob() });
  } catch (error) {
    console.error("[cron referrals] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Referral job failed" } }, { status: 500 });
  }
}
