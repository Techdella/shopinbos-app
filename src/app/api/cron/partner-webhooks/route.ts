import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { retryDueWebhooks } from "@/lib/logistics/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Delivery partner webhooks that still failed after their in-request retries: one more attempt each when due (5 min,
// 30 min, 2 h, 6 h, 24 h after the first try), then given up. Called every 5 minutes (scripts/qstash-schedules.mjs)
// with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await retryDueWebhooks(new Date()) });
  } catch (error) {
    console.error("[cron partner-webhooks] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not retry partner webhooks" } }, { status: 500 });
  }
}
