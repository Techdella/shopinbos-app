import { NextRequest, NextResponse } from "next/server";
import { runAutoReviewRequests } from "@/lib/reviews/requests";

export const maxDuration = 300;

// Daily: asks buyers to review delivered orders for stores that turned on "Ask after delivery".
// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "CRON_SECRET is not set" } }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const stores = await runAutoReviewRequests();
  return NextResponse.json({ data: { stores: stores.length, results: stores } });
}
