import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { LeadGrowthNotReady, runLeadGrowth } from "@/lib/lead-growth/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Lead growth: scheduled lead campaigns, automation steps that are due, and matching new accounts to the leads they
// came from. Called by Supabase pg_cron every 10 minutes (docs/migrations/2026-11-05-lead-growth.sql) with
// `Authorization: Bearer $CRON_SECRET`. Safe to call again: every message is claimed once before it is sent.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await runLeadGrowth(Date.now() + 240_000) });
  } catch (error) {
    if (error instanceof LeadGrowthNotReady) return NextResponse.json({ error: { code: "NOT_READY", message: error.message } }, { status: 503 });
    console.error("[cron lead-growth] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Lead growth run failed" } }, { status: 500 });
  }
}
