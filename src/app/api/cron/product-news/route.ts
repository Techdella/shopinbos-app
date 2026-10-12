import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { runProductNewsCron } from "@/lib/email/product-news.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Product news (/admin/product-news): starts broadcasts scheduled for now or earlier and carries on with any still
// sending, in bounded batches. Called every 10 minutes by Supabase pg_cron
// (docs/migrations/2026-10-16-weekly-summary-product-news.sql) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    return NextResponse.json({ data: await runProductNewsCron(new Date(), Date.now() + 240_000) });
  } catch (error) {
    console.error("[cron product-news] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Product news run failed" } }, { status: 500 });
  }
}
