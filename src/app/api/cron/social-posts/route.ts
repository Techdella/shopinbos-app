import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { publishDue } from "@/lib/social-posts/server";

export const maxDuration = 300;

// Social posts: posts the scheduled ones that are due to Facebook and Instagram, marks WhatsApp, TikTok and X ready
// for the seller's tap, and finishes Instagram reels still processing. Every 5 minutes on QStash
// (scripts/qstash-schedules.mjs) with the cron secret or a signed QStash call.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await publishDue(new Date()) });
  } catch (error) {
    console.error("[cron social-posts] failed", error);
    return NextResponse.json({ error: { code: "FAILED", message: error instanceof Error ? error.message : "failed" } }, { status: 500 });
  }
}
