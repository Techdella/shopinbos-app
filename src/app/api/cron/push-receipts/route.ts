import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { runPushMaintenance } from "@/lib/notifications/notify.server";

export const maxDuration = 120;

// Every 5 minutes (Authorization: Bearer $CRON_SECRET): sends "5 new orders" summaries for held bursts and the
// morning summary after quiet hours, reads Expo push receipts (switching off phones whose app was removed) and
// clears delivery history older than 30 days.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const result = await runPushMaintenance();
  return NextResponse.json({ data: result });
}
