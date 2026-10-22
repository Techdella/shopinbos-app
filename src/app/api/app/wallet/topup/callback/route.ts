import { NextRequest, NextResponse } from "next/server";
import { confirmCardTopUp } from "@/lib/wallet/balance.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paystack sends them back here after a card top-up; the webhook may have counted it first (either is fine).
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("returnTo");
  const url = new URL(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/home/wallet", req.nextUrl.origin);
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  url.searchParams.set("topup", reference ? await confirmCardTopUp(reference).catch(() => "pending" as const) : "failed");
  return NextResponse.redirect(url);
}
