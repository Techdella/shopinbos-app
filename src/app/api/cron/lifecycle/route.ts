import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendLifecycleEmails } from "@/lib/setup/lifecycle.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Setup nudges for new sellers (src/lib/setup/lifecycle.ts), hourly: Supabase pg_cron ("lifecycle-emails") with
// `Authorization: Bearer $CRON_SECRET`, or a signed QStash call (docs/qstash.md).
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await sendLifecycleEmails() });
  } catch (error) {
    console.error("[cron lifecycle] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Lifecycle emails failed" } }, { status: 500 });
  }
}
