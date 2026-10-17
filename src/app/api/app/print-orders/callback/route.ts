import { NextRequest, NextResponse } from "next/server";
import { completePrintOrderPayment } from "@/lib/packaging/print-orders.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack sends the seller back here after paying for prints; the webhook may get there first (either is fine).
export async function GET(req: NextRequest) {
  const url = new URL("/home/labels/orders", req.nextUrl.origin);
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  try {
    url.searchParams.set("paid", reference ? await completePrintOrderPayment(reference) : "failed");
  } catch (error) {
    console.error("[print-orders] verify failed", error);
    url.searchParams.set("paid", "failed");
  }
  return NextResponse.redirect(url);
}
