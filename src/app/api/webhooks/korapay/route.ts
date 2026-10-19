import { NextRequest, NextResponse } from "next/server";
import { korapaySecretKey } from "@/lib/korapay";
import { verifyKorapaySignature } from "@/lib/korapay-signature";
import { confirmKorapayOrderPayment } from "@/lib/commerce/korapay-orders.server";

// Korapay webhooks (https://developers.korapay.com/docs/webhooks): POST { event, data }, with x-korapay-signature
// = HMAC-SHA256 (secret key, hex) of JSON.stringify(data). Each checkout sends this URL as its notification_url.
//
// A valid signature only tells us Korapay sent it: the order is marked paid after asking Korapay's charge API
// (confirmKorapayOrderPayment), never from the body. Korapay retries anything but a 200 for 72 hours, so a 500
// here (Korapay or the database unreachable) is retried and everything below is idempotent. Refund events need
// nothing: split orders are refunded by the seller, who was paid (src/lib/commerce/refunds.ts).

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(req: NextRequest) {
  const secret = korapaySecretKey();
  if (!secret) return new NextResponse("Korapay is not configured", { status: 503 });

  const event = (await req.json().catch(() => null)) as { event?: unknown; data?: Record<string, unknown> } | null;
  const data = event?.data && typeof event.data === "object" ? event.data : null;
  if (!data) return new NextResponse("Invalid body", { status: 400 });
  if (!verifyKorapaySignature(data, req.headers.get("x-korapay-signature"), secret)) {
    console.warn("[korapay webhook] rejected a webhook with a bad signature", { event: event?.event, reference: data.reference });
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const name = text(event?.event);
  if (name !== "charge.success" && name !== "charge.failed") return new NextResponse("OK", { status: 200 });

  // Our reference (the order id) comes back as payment_reference, or as reference.
  const orderId = text(data.payment_reference) || text(data.reference);
  if (!orderId) return new NextResponse("OK", { status: 200 });
  try {
    const outcome = await confirmKorapayOrderPayment(orderId);
    if (outcome === "rejected") console.warn(`[korapay webhook] ${orderId}: not applied`);
  } catch (error) {
    console.error(`[korapay webhook] ${name} for ${orderId} failed`, error);
    return new NextResponse("Retry later", { status: 500 });
  }
  return new NextResponse("OK", { status: 200 });
}
