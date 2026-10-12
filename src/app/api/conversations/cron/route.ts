import { NextRequest, NextResponse } from "next/server";
import { sendUnreadEmails } from "@/lib/conversations/service.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Emails people whose partner messages are still unread after a few minutes.
// Call with `Authorization: Bearer $CRON_SECRET` (Vercel Cron or any scheduler, e.g. every 10 minutes).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  return NextResponse.json({ data: await sendUnreadEmails() });
}
