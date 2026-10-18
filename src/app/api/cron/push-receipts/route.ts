import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runPushMaintenance } from "@/lib/notifications/notify.server";

export const maxDuration = 120;

// Every 5 minutes (Authorization: Bearer $CRON_SECRET): sends "5 new orders" summaries for held bursts and the
// morning summary after quiet hours, reads Expo push receipts (switching off phones whose app was removed) and
// clears delivery history older than 30 days.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  const result = await runPushMaintenance();
  return NextResponse.json({ data: result });
}
