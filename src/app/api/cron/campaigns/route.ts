import { NextRequest, NextResponse } from "next/server";
import { cronAuthorization } from "@/lib/auth/cron";
import { sendDueCampaigns } from "@/lib/campaigns/send";

export const maxDuration = 300;

// Sends scheduled campaigns whose time has come. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (cronAuthorization(req.headers.get("authorization"), secret) !== "ok") {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const results = await sendDueCampaigns();
  return NextResponse.json({ data: { processed: results.length, results } });
}
