import { NextRequest, NextResponse } from "next/server";
import { completeExtraPurchase } from "@/lib/plans/extras.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack sends the buyer back here after paying for an add-on or boost; the webhook may credit it first.
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("returnTo");
  const url = new URL(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/", req.nextUrl.origin);
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  try {
    url.searchParams.set("extra", reference ? await completeExtraPurchase(reference) : "failed");
  } catch (error) {
    url.searchParams.set("extra", "failed");
    url.searchParams.set("error", error instanceof Error ? error.message : "Payment verification failed.");
  }
  return NextResponse.redirect(url);
}
