import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runTipsJob } from "@/lib/member-messaging/tips.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Weekly tips from Rex & Peggy (every 15 minutes; pg_cron "member-tips" or QStash, docs/qstash.md). Sends only on
// Wednesday (WhatsApp) and Thursday (email) from 10:00 Lagos, and only when switched on in Admin › Leads › Member tips.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await runTipsJob() });
  } catch (error) {
    console.error("[cron member-tips] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Tips job failed" } }, { status: 500 });
  }
}
