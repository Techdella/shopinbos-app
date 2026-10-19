import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendVerificationReminders } from "@/lib/verification/reminders.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Reminds suppliers and delivery partners to finish verification (1, 3 and 7 days after they start without
// documents). Call with `Authorization: Bearer $CRON_SECRET`, hourly.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  return NextResponse.json({ data: await sendVerificationReminders() });
}
