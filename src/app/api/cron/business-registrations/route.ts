import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runRegistrationChecks } from "@/lib/business-registration/service.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Business name registrations with CAC (src/lib/business-registration), every 30 minutes: finishes payments the
// callback and webhook missed, retries filings CAC didn't take yet, and reads CAC's answer (approved or queried) on
// the rest. QStash (scripts/qstash-schedules.mjs) or pg_cron with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await runRegistrationChecks() });
  } catch (error) {
    console.error("[cron business-registrations] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Registration checks failed" } }, { status: 500 });
  }
}
