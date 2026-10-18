import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runProductNewsCron } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Product news (/admin/product-news): starts broadcasts scheduled for now or earlier and carries on with any still
// sending, in bounded batches. Called every 10 minutes by Supabase pg_cron
// (docs/migrations/2026-10-16-weekly-summary-product-news.sql) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await runProductNewsCron(new Date(), Date.now() + 240_000) });
  } catch (error) {
    console.error("[cron product-news] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Product news run failed" } }, { status: 500 });
  }
}
