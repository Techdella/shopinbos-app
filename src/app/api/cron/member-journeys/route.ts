import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runJourneys } from "@/lib/member-messaging/journeys.server";
import { runReferralAnnouncement } from "@/lib/member-messaging/announce.server";
import { runLoyalty } from "@/lib/member-messaging/loyalty.server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Hourly (pg_cron "member-journeys", or QStash): the retention journeys (setup help, win-back, first wins, low credits)
// and loyalty perks when switched on in Admin › Leads › Member tips, and the Refer & earn announcement while it runs.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    const deadline = Date.now() + 240_000;
    const journeys = await runJourneys(new Date(), deadline - 60_000);
    const announcement = await runReferralAnnouncement(new Date(), deadline - 30_000);
    const loyalty = await runLoyalty(new Date(), deadline);
    return NextResponse.json({ data: { journeys, announcement, loyalty } });
  } catch (error) {
    console.error("[cron member-journeys] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Journeys job failed" } }, { status: 500 });
  }
}
