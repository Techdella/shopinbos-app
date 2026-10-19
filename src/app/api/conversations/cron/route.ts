import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendUnreadEmails } from "@/lib/conversations/service.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Emails people whose partner messages are still unread after a few minutes.
// Call with `Authorization: Bearer $CRON_SECRET` (Vercel Cron or any scheduler, e.g. every 10 minutes).
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  return NextResponse.json({ data: await sendUnreadEmails() });
}
