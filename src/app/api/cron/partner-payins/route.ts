import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
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
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const result = await runPartnerPayInSweep(new Date());
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[cron partner-payins] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not check partner pay-ins" } }, { status: 500 });
  }
}
