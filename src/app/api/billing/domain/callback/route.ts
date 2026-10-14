import { NextRequest, NextResponse } from "next/server";
import { completeDomainPayment } from "@/lib/domains/billing.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Buying waits up to ~10 seconds for the registrar order to finish before coming back.
export const maxDuration = 60;

// Paystack sends the seller back here after paying for a domain (or a renewal). The same idempotent
// completeDomainPayment runs from the webhook, so whichever arrives first does the work. Back on /home/domain,
// ?domain=bought|renewed|processing|failed shows the result (DomainPurchaseBanner keeps checking while processing).
function back(req: NextRequest, result: string) {
  const url = new URL("/home/domain", req.nextUrl.origin);
  url.searchParams.set("domain", result);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference")?.trim() ?? req.nextUrl.searchParams.get("trxref")?.trim();
  if (!reference) return back(req, "failed");
  try {
    const row = await completeDomainPayment(reference);
    if (row.status === "bought") return back(req, row.kind === "renewal" ? "renewed" : "bought");
    if (row.status === "paid" || row.status === "buying") return back(req, "processing");
    return back(req, "failed");
  } catch (error) {
    console.error("[domain billing] callback failed", error instanceof Error ? error.message : error);
    return back(req, "failed");
  }
}
