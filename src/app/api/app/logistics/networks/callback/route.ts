import { NextRequest, NextResponse } from "next/server";
import { completeNetworkCheckout } from "@/lib/logistics/networks.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack sends the seller back here after paying for a delivery network booking; the webhook may get there
// first (either is fine: the booking is made once).
export async function GET(req: NextRequest) {
  const url = new URL("/home/logistics", req.nextUrl.origin);
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  try {
    url.searchParams.set("network", reference ? await completeNetworkCheckout(reference) : "failed");
  } catch (error) {
    console.error("[delivery networks] verify failed", error);
    url.searchParams.set("network", "pending");
  }
  url.hash = "networks";
  return NextResponse.redirect(url);
}
