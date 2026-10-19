import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runPartnerPayInSweep } from "@/lib/logistics/payin-standing.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Delivery partners' cash pay-in deadline (lib/logistics/payin-deadline.ts): reminds a partner 2 hours before the
// cut-off (6pm Lagos, PARTNER_PAYIN_CUTOFF_HOUR) if they still owe, flags and pauses them from new
// pay-when-it-arrives jobs once the cut-off plus grace (PARTNER_PAYIN_GRACE_MINUTES) has passed, escalates at 24 and
// 72 hours, counts strikes, and clears anyone whose late cash is now paid in. Idempotent: each message is keyed in
// PartnerPayInEvent and sent once. Called every 15 minutes by Supabase pg_cron
// (docs/migrations/2026-10-19-payin-deadline.sql) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const result = await runPartnerPayInSweep(new Date());
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron partner-payins] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not check partner pay-ins" } }, { status: 500 });
  }
}
