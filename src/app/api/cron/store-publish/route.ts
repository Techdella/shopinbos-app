import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runScheduledPublishes } from "@/lib/store-editor/scheduled-publish.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Every 5 minutes (QStash schedule "store-publish", or Authorization: Bearer $CRON_SECRET from pg_cron): puts live each
// shop publish whose scheduled time has come ("Schedule for later" in the phone's store editor, design SE-13), with
// the same publishStoreDraft as Publish now, then tells the seller (push + bell). Each one once (claimed first).
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  const result = await runScheduledPublishes();
  return NextResponse.json({ data: result });
}
