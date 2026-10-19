import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runMoneyOwedSweep } from "@/lib/money-owed/money-owed.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Money owed between businesses (src/lib/money-owed): records what suppliers owe back for dropship orders they were
// paid for at checkout and didn't send (in case a status change missed it), and reminds each business once a day
// while what it owes is due within a day or overdue. Idempotent. Called hourly by Supabase pg_cron
// (docs/migrations/2026-11-10-money-owed.sql) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const result = await runMoneyOwedSweep(new Date());
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron money-owed] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not check money owed" } }, { status: 500 });
  }
}
