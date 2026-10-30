import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runTogetherSweep } from "@/lib/pay-together/payments.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Pay small small, ajo and group buy (src/lib/pay-together): reminders the day before a payment is due (8am–9pm
// Lagos), autopay charges on the due day (each with the seller's split), missed payments after 2 days' grace (plans
// defaulted, ajo members removed), group buys past their deadline cancelled (nobody charged) and pay links past 2
// hours dropped. Idempotent. Called hourly by Supabase pg_cron (docs/migrations/2026-12-17-pay-small-ajo-groupbuy.sql)
// with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await runTogetherSweep(new Date()) });
  } catch (error) {
    console.error("[cron pay-together] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not run the pay-together sweep" } }, { status: 500 });
  }
}
