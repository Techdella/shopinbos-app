import { NextRequest, NextResponse } from "next/server";
import { completeRegistrationPayment, registrationPage } from "@/lib/business-registration/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Filing with CAC sends the pictures along, which can take a while.
export const maxDuration = 120;

// Paystack sends the owner back here after paying for a business name registration. The same idempotent
// completeRegistrationPayment runs from the webhook and the cron, so whichever arrives first files it with CAC.
// Back on the registration page, ?registration=submitted|processing|refunded|refund_failed|failed shows the result.
function back(req: NextRequest, role: string, result: string) {
  const url = new URL(registrationPage(role), req.nextUrl.origin);
  url.searchParams.set("registration", result);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference")?.trim() ?? req.nextUrl.searchParams.get("trxref")?.trim();
  const role = req.nextUrl.searchParams.get("role") ?? "seller";
  if (!reference) return back(req, role, "failed");
  try {
    const row = await completeRegistrationPayment(reference);
    if (row.status === "submitted") return back(req, row.role, "submitted");
    if (row.status === "paid" || row.status === "submitting") return back(req, row.role, "processing");
    if (row.status === "refunded" || row.status === "refund_failed") return back(req, row.role, row.status);
    return back(req, row.role, "failed");
  } catch (error) {
    console.error("[business registration] callback failed", error instanceof Error ? error.message : error);
    // A payment that went through but didn't match was refunded (payment_mismatch); anything else wasn't charged.
    const code = error && typeof error === "object" && "code" in error ? (error as { code?: string }).code : "";
    return back(req, role, code === "payment_mismatch" ? "refunded" : "failed");
  }
}
