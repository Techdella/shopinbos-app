import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendPostReminders } from "@/lib/create/posts.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Every 5 minutes (QStash schedule, or Authorization: Bearer $CRON_SECRET compared in constant time): "Time to post:
// <caption start>" push + bell notification for each calendar post whose time has come, once (remindedAt). Its
// link, app:/posts/<id>, opens the post with Share in the phone app. Nothing is posted for anyone.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  const result = await sendPostReminders();
  return NextResponse.json({ data: result });
}
