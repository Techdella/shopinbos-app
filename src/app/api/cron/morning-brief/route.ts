import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { sendMorningBriefs } from "@/lib/dashboard/morning-brief.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// Peggy's morning brief for suppliers and delivery partners: what needs them today (shared/partner-brief.ts), as
// one notification. Call with `Authorization: Bearer $CRON_SECRET`, daily at 06:31 UTC (7:31 in Lagos).
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  return NextResponse.json({ data: await sendMorningBriefs() });
}
