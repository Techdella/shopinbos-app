import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runProductNewsCron } from "@/lib/email/product-news.server";
import { runPromotionNotices } from "@/lib/pricing/promotions.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Product news (/admin/product-news): starts broadcasts scheduled for now or earlier and carries on with any still
// sending, in bounded batches. Also sends the in-app notice + push for price promotions that have gone live
// (src/lib/pricing/promotions.server.ts; their emails are product-news broadcasts, so they go out above). Called every 10 minutes by Supabase pg_cron
// (docs/migrations/2026-10-16-weekly-summary-product-news.sql) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const news = await runProductNewsCron(new Date(), Date.now() + 180_000);
    const promotions = await runPromotionNotices(new Date(), Date.now() + 60_000).catch((error) => {
      console.error("[cron product-news] promotion notices failed", error);
      return { error: error instanceof Error ? error.message : "failed" };
    });
    return NextResponse.json({ data: { ...news, promotions } });
  } catch (error) {
    console.error("[cron product-news] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Product news run failed" } }, { status: 500 });
  }
}
