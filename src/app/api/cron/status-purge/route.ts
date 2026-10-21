import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { purgeExpiredStatus } from "@/lib/status/status.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Hourly (QStash schedule "status-purge" in scripts/qstash-schedules.mjs, or `Authorization: Bearer $CRON_SECRET`,
// checked in constant time by cronDenied): deletes status posts that expired (24 hours after posting), with their
// views, likes and photos. Reads never return an expired post, so this is only clean-up.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  try {
    let deleted = 0;
    let images = 0;
    // A few passes of 500 so a backlog clears in one call without running long.
    for (let pass = 0; pass < 5; pass += 1) {
      const result = await purgeExpiredStatus({ limit: 500 });
      deleted += result.deleted;
      images += result.images;
      if (result.deleted < 500) break;
    }
    return NextResponse.json({ data: { deleted, images } });
  } catch (error) {
    console.error("[cron status-purge] failed", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not purge expired status posts" } }, { status: 500 });
  }
}
