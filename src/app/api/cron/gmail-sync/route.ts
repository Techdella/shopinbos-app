import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { syncAllGmail } from "@/lib/email-channel/gmail.server";
import { checkPendingDomains } from "@/lib/email-channel/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Email channel upkeep, every 5 minutes (Supabase pg_cron, docs/migrations/2026-10-31-email-channel.sql) with
// `Authorization: Bearer $CRON_SECRET`:
//  • Gmail: customers' replies to threads started in the app (and mail from known customers) come into the inbox.
//  • Own domains still waiting for their DNS records are checked again, so "Connected" shows up by itself.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const [gmail, domains] = await Promise.all([syncAllGmail(), process.env.RESEND_API_KEY ? checkPendingDomains() : Promise.resolve({ checked: 0, verified: 0 })]);
    return NextResponse.json({ data: { gmail, domains } });
  } catch (error) {
    console.error("[cron gmail-sync] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Email sync failed" } }, { status: 500 });
  }
}
