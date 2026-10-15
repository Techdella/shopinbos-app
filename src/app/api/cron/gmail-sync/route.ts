import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { syncAllGmail } from "@/lib/email-channel/gmail.server";
import { checkPendingDomains } from "@/lib/email-channel/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Email channel upkeep, every 5 minutes (Supabase pg_cron, docs/migrations/2026-10-31-email-channel.sql) with
// `Authorization: Bearer $CRON_SECRET`:
//  • Gmail: customers' replies to threads started in the app (and mail from known customers) come into the inbox.
//  • Own domains still waiting for their DNS records are checked again, so "Connected" shows up by itself.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const [gmail, domains] = await Promise.all([syncAllGmail(), process.env.RESEND_API_KEY ? checkPendingDomains() : Promise.resolve({ checked: 0, verified: 0 })]);
    return NextResponse.json({ data: { gmail, domains } });
  } catch (error) {
    console.error("[cron gmail-sync] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Email sync failed" } }, { status: 500 });
  }
}
