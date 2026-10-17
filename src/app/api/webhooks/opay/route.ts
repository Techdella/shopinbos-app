import { NextRequest, NextResponse } from "next/server";
import { opaySecretKey } from "@/lib/opay";
import { verifyCallbackSignature, type OpayCallbackPayload } from "@/lib/opay-signature";
import { confirmHostedOrderPayment } from "@/lib/commerce/hosted-checkout.server";
import { applyHostedRefundStatus } from "@/lib/commerce/refunds.server";
import { orderIdFromOpayRefund, refundStatusFromOpay } from "@/lib/commerce/refunds";

// OPay Checkout callbacks (https://documentation.opaycheckout.com/payment-notifications-callbacks): POST
// { payload, sha512, type: "transaction-status" }, signed with HMAC-SHA3-512 using the secret key. Set this URL
// (https://<app>/api/webhooks/opay) as the webhook URL in the OPay dashboard too; each cashier also sends it.
//
// A valid signature only tells us OPay sent it: the order is marked paid after asking OPay's status API
// (confirmHostedOrderPayment), never from the body. OPay retries anything but a 2xx for 72 hours, so a 500 here
// (OPay or the database unreachable) is retried and everything below is idempotent.

export async function POST(req: NextRequest) {
  const secret = opaySecretKey();
  if (!secret) return new NextResponse("OPay is not configured", { status: 503 });

  const event = (await req.json().catch(() => null)) as { payload?: OpayCallbackPayload; sha512?: unknown; type?: unknown } | null;
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : null;
  if (!payload) return new NextResponse("Invalid body", { status: 400 });
  if (!verifyCallbackSignature(payload, event?.sha512, secret)) {
    console.warn("[opay webhook] rejected a callback with a bad signature", { reference: payload.reference });
    return new NextResponse("Invalid signature", { status: 401 });
  }
  if (event?.type !== undefined && event.type !== "transaction-status") return new NextResponse("OK", { status: 200 });

  const reference = typeof payload.reference === "string" ? payload.reference.trim() : "";
  if (!reference) return new NextResponse("OK", { status: 200 });

  try {
    // A refund we started (refund-<order id>).
    const refundOrderId = orderIdFromOpayRefund(reference);
    if (refundOrderId) {
      await applyHostedRefundStatus(refundOrderId, "opay", refundStatusFromOpay(payload.status), String(payload.status ?? "failed"));
      return new NextResponse("OK", { status: 200 });
    }
    // A storefront order (the reference is the order id).
    const outcome = await confirmHostedOrderPayment(reference, "opay");
    if (outcome === "rejected") console.warn(`[opay webhook] ${reference}: not applied`);
  } catch (error) {
    console.error(`[opay webhook] ${reference} failed`, error);
    return new NextResponse("Retry later", { status: 500 });
  }
  return new NextResponse("OK", { status: 200 });
}
