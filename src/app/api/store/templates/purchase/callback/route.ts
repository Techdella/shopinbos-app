import { NextRequest, NextResponse } from "next/server";
import { completeThemePurchase } from "@/lib/themes/purchase.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack sends the seller back here after paying for a theme; the webhook may finish it first (either is fine).
// Back in the gallery, ?theme=paid|pending|failed&themeId=… shows the result.
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("returnTo");
  const url = new URL(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/builder/templates", req.nextUrl.origin);
  const reference = req.nextUrl.searchParams.get("reference")?.trim() ?? req.nextUrl.searchParams.get("trxref")?.trim();
  try {
    if (!reference) throw new Error("No payment reference.");
    const result = await completeThemePurchase(reference);
    url.searchParams.set("theme", result.status);
    url.searchParams.set("themeId", result.themeId);
  } catch (error) {
    url.searchParams.set("theme", "failed");
    console.error("[themes] callback failed", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(url);
}
