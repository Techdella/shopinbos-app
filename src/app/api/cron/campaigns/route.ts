import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendDueCampaigns } from "@/lib/campaigns/send";

export const maxDuration = 300;

// Sends scheduled campaigns whose time has come. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  const results = await sendDueCampaigns();
  return NextResponse.json({ data: { processed: results.length, results } });
}
