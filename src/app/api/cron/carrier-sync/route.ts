import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { syncCarrierJobs } from "@/lib/logistics/carriers/jobs.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Delivery companies we book through their own API (lib/logistics/carriers, e.g. Kwik) don't tell us when a job
// moves, so this reads the status of their open jobs and moves each one (and the seller's order) to match. Called
// every 10 minutes by Supabase pg_cron (docs/migrations/2026-10-23-carrier-integrations.sql) with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const result = await syncCarrierJobs({ limit: 60 });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron carrier-sync] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not sync carrier jobs" } }, { status: 500 });
  }
}
