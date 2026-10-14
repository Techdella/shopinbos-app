import { NextRequest, NextResponse } from "next/server";
import { completeCreditPurchase } from "@/lib/ai/credits.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack sends the buyer back here after paying for credits; the webhook may credit them first (either is fine).
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("returnTo");
  const url = new URL(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/home/credits", req.nextUrl.origin);
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  try {
    url.searchParams.set("credits", reference ? await completeCreditPurchase(reference) : "failed");
  } catch (error) {
    url.searchParams.set("credits", "failed");
    url.searchParams.set("error", error instanceof Error ? error.message : "Payment verification failed.");
  }
  return NextResponse.redirect(url);
}
