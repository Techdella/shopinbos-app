import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitShared, rateLimitKey, requestIp } from "@/lib/rate-limit";
import { appReturnUrl } from "@/lib/sales-channels/pure";
import { confirmAppPayment, isAppPaymentReference } from "@/lib/payments/app-return.server";
import { APP_PAID_DEEP_LINK, appPaidDeepLink, referenceFromPaystackReturn, type PayOutcome } from "@shared/paystack-return";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/mobile/paid?app=<the app's return address>&reference=…  (Paystack adds reference and trxref)
// Paystack's callback for payments the phone app starts (shared/paystack-return.ts). It confirms the payment with
// Paystack (the same idempotent confirm the webhook runs: verify on return as well as by webhook), then sends the
// in-app browser to shopinbos://paid?ref=…&status=paid|pending|cancelled, which closes it and returns to the app.
// No sign-in here: nothing is trusted but Paystack's own record, and the app confirms again with its sign-in.

export async function GET(req: NextRequest) {
  const app = appReturnUrl(req.nextUrl.searchParams.get("app")) ?? APP_PAID_DEEP_LINK;
  const reference = referenceFromPaystackReturn(req.nextUrl.searchParams);
  let outcome: PayOutcome | null = null;
  if (reference && isAppPaymentReference(reference)) {
    const allowed = await checkRateLimitShared(rateLimitKey("app-paid-return", requestIp(req.headers)), { maxRequests: 30, windowMs: 60_000 })
      .then((result) => result.allowed)
      .catch(() => true);
    if (allowed) outcome = (await confirmAppPayment(reference)).outcome;
  }
  const response = NextResponse.redirect(appPaidDeepLink(app, reference ?? "", outcome), 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
