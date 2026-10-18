import { NextRequest, NextResponse } from "next/server";
import { cronDenied } from "@/lib/auth/cron-request";
import { runAutoReviewRequests } from "@/lib/reviews/requests";

export const maxDuration = 300;

// Daily: asks buyers to review delivered orders for stores that turned on "Ask after delivery".
// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const denied = await cronDenied(req);
  if (denied) return denied;
  const stores = await runAutoReviewRequests();
  return NextResponse.json({ data: { stores: stores.length, results: stores } });
}
