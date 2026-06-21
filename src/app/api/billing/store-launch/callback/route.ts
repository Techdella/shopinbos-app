import { NextRequest, NextResponse } from "next/server";
import { completeStoreLaunchPayment } from "@/lib/store-launch-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onboardingRedirect(req: NextRequest, params: Record<string, string>) {
  const requestedPath = req.nextUrl.searchParams.get("returnTo");
  const returnTo = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
    ? requestedPath
    : "/onboarding/rex";
  const url = new URL(returnTo, req.nextUrl.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference")?.trim();
  if (!reference) return onboardingRedirect(req, { launch: "failed", error: "Missing payment reference." });
  try {
    await completeStoreLaunchPayment(reference);
    return onboardingRedirect(req, { launch: "paid" });
  } catch (error) {
    return onboardingRedirect(req, {
      launch: "failed",
      error: error instanceof Error ? error.message : "Payment verification failed.",
    });
  }
}
