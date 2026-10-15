import { NextRequest, NextResponse } from "next/server";
import { completeAdSetupPayment } from "@/lib/ad-campaigns/requests.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack sends the seller back here after paying the ad setup fee; the webhook may get there first (either is fine).
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("returnTo");
  const url = new URL(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/home/ads", req.nextUrl.origin);
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  try {
    url.searchParams.set("setup", reference ? await completeAdSetupPayment(reference) : "failed");
  } catch (error) {
    console.error("[ad-requests] verify failed", error);
    url.searchParams.set("setup", "failed");
  }
  return NextResponse.redirect(url);
}
