import { completeCreditPurchase, grantPlanCredits } from "@/lib/ai/credits.server";
import { CREDIT_REFERENCE_PREFIX } from "@shared/ai-credits";
import { AD_SETUP_REFERENCE_PREFIX } from "@shared/ad-campaigns";
import { completeAdSetupPayment } from "@/lib/ad-campaigns/requests.server";
import { PRINT_ORDER_REFERENCE_PREFIX } from "@shared/print-orders";
import { completePrintOrderPayment } from "@/lib/packaging/print-orders.server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import crypto from "crypto";
import { completeStoreLaunchPayment } from "@/lib/store-launch-billing";
import { DOMAIN_REFERENCE_PREFIX, completeDomainPayment } from "@/lib/domains/billing.server";
import { completeRegistrationPayment } from "@/lib/business-registration/service.server";
import { REGISTRATION_REFERENCE_PREFIX } from "@shared/business-registration";
import { PAYABLE_ORDER_STATUSES, retailChargeProblem } from "@/lib/commerce/paystack-charge";
import { recoverExpiredOrderPayment } from "@/lib/commerce/order-expiry.server";
import { applyRefundEvent } from "@/lib/commerce/refunds.server";
import { afterRetailOrderPaid } from "@/lib/commerce/order-paid.server";
import { SELLER_PAYIN_PREFIX, confirmSellerPayIn } from "@/lib/logistics/seller-payins.server";
import { DELIVERY_FEE_PREFIX, confirmDeliveryFeePayment } from "@/lib/logistics/delivery-fee-payments.server";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { isDedicatedCharge } from "@/lib/logistics/payin-rules";
import { handleDedicatedAccountAssign, handleDedicatedAccountCharge } from "@/lib/logistics/payins.server";
import { recordInvoicePaid, recordSubscriptionCreated, recordSubscriptionStatus } from "@/lib/seller-plan.server";
import { getPlanCatalog } from "@/lib/plans/catalog.server";
import { FREE_PLAN_MARKER, planMarker } from "@shared/plan-catalog";

// The plan itself (code, monthly/annual, status, paid-until) is recorded on User for the free-domain rule
// (src/lib/seller-plan.ts). A failure there is logged, never fails the webhook: the credits above still apply.
function recordPlan(work: Promise<unknown>) {
  return work.catch((error) => console.error("[paystack webhook] could not record the seller plan", error));
}


function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  try {
    const signatureBuffer = Buffer.from(signature, "hex");
    return hashBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(hashBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-paystack-signature");
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";

  if (!secret || secret.includes("your_") || secret.includes("your-")) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Webhook secret is not configured", { status: 503 });
    }
  } else {
    if (!verifySignature(body, signature, secret)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  let event: any;
  try {
    event = JSON.parse(body);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const eventType = event.event as string;

  // ── Delivery partners' pay-in accounts (Paystack Dedicated Virtual Accounts) ──────────────────────────────
  // A transfer into a partner's own account settles their cash from pay-on-delivery jobs (lib/logistics/payins.server.ts).
  // Kept apart from everything below: it is never a store order or a subscription. Idempotent on the Paystack
  // reference, so a 500 here (the database was unreachable) is safe for Paystack to retry.
  if ((eventType === "charge.success" && isDedicatedCharge(event.data)) || eventType?.startsWith("dedicatedaccount.assign.")) {
    try {
      if (eventType === "charge.success") await handleDedicatedAccountCharge(event.data);
      else await handleDedicatedAccountAssign(eventType, event.data);
    } catch (error) {
      console.error(`[paystack webhook] pay-in account event ${eventType} failed`, error);
      return new NextResponse("Retry later", { status: 500 });
    }
    return new NextResponse("OK", { status: 200 });
  }

  // ── Subscription created (first payment via plan) ────────────────────────
  // Subscription events: load the plan catalog first so plan codes created from Admin › Pricing › Plans are known.
  if (eventType?.startsWith("subscription.") || eventType === "invoice.update") await getPlanCatalog();

  if (eventType === "subscription.create") {
    const planCode = event.data?.plan?.plan_code as string | undefined;
    const customerEmail = event.data?.customer?.email as string | undefined;
    const marker = planMarker(planCode);
    if (planCode && customerEmail && marker !== null) {
      await db.user.updateMany({
        where: { email: customerEmail },
        data: { aiCredits: marker },
      });
    }
    await recordPlan(recordSubscriptionCreated(event.data ?? {}));
  }

  // ── Invoice paid (monthly renewal) ───────────────────────────────────────
  if (eventType === "invoice.payment_failed") {
    // future: send payment failure email to subscriber
  }

  if (eventType === "invoice.update" && event.data?.paid === true) {
    const planCode = event.data?.subscription?.plan?.plan_code as string | undefined;
    const customerEmail = event.data?.customer?.email as string | undefined;
    const marker = planMarker(planCode);
    if (planCode && customerEmail && marker !== null) {
      await db.user.updateMany({
        where: { email: customerEmail },
        data: { aiCredits: marker },
      });
      // Each paid renewal adds the plan's credits to the balance (once per invoice).
      const payer = await db.user.findFirst({ where: { email: { equals: customerEmail, mode: "insensitive" } }, select: { id: true } });
      const reference = (event.data?.transaction?.reference as string | undefined) ?? (event.data?.invoice_code as string | undefined);
      if (payer && reference) await grantPlanCredits(payer.id, planCode, reference).catch((error) => console.error("Plan credits not added:", error));
    }
    await recordPlan(recordInvoicePaid(event.data ?? {}));
  }

  // ── Subscription cancelled ────────────────────────────────────────────────
  if (eventType === "subscription.disable" || eventType === "subscription.not_renew") {
    const customerEmail = event.data?.customer?.email as string | undefined;
    if (customerEmail) {
      await db.user.updateMany({
        where: { email: customerEmail },
        data: { aiCredits: FREE_PLAN_MARKER },
      });
    }
    await recordPlan(recordSubscriptionStatus(event.data ?? {}, eventType === "subscription.disable" ? "cancelled" : "non_renewing"));
  }

  // ── Cash on delivery a delivery partner paid to a seller (split to the seller's own bank) ──
  // Idempotent on the reference, so a 500 (Paystack or the database unreachable) is safe for Paystack to retry.
  if (eventType === "charge.success" && typeof event.data?.reference === "string" && event.data.reference.startsWith(SELLER_PAYIN_PREFIX)) {
    const result = await confirmSellerPayIn(event.data.reference).catch((error) => ({ ok: false as const, error: String(error), retry: true }));
    if (!result.ok && result.retry) return new NextResponse("Retry later", { status: 500 });
    if (!result.ok) console.warn(`[paystack webhook] seller pay-in ${event.data.reference} not applied: ${result.error}`);
    return new NextResponse("OK", { status: 200 });
  }

  // ── A delivery fee a seller paid by card (split to the delivery partner's own bank) ──
  if (eventType === "charge.success" && typeof event.data?.reference === "string" && event.data.reference.startsWith(DELIVERY_FEE_PREFIX)) {
    const result = await confirmDeliveryFeePayment(event.data.reference).catch((error) => ({ ok: false as const, error: String(error), retry: true }));
    if (!result.ok && result.retry) return new NextResponse("Retry later", { status: 500 });
    if (!result.ok) console.warn(`[paystack webhook] delivery fee ${event.data.reference} not applied: ${result.error}`);
    return new NextResponse("OK", { status: 200 });
  }

  // ── Retail order payment (storefront checkout) ────────────────────────────
  if (eventType === "charge.success") {
    const ref = event.data?.reference as string | undefined;
    if (ref) {
      if (ref.startsWith(AD_SETUP_REFERENCE_PREFIX)) {
        await completeAdSetupPayment(ref).catch((error) => {
          console.error("Ad setup payment completion failed:", error);
        });
        return NextResponse.json({ received: true });
      }
      if (ref.startsWith(PRINT_ORDER_REFERENCE_PREFIX)) {
        await completePrintOrderPayment(ref).catch((error) => {
          console.error("Print order payment completion failed:", error);
        });
        return NextResponse.json({ received: true });
      }
      if (ref.startsWith(CREDIT_REFERENCE_PREFIX)) {
        await completeCreditPurchase(ref).catch((error) => {
          console.error("AI credit purchase completion failed:", error);
        });
        return NextResponse.json({ received: true });
      }
      if (ref.startsWith("store-launch-")) {
        await completeStoreLaunchPayment(ref).catch((error) => {
          console.error("Store launch payment completion failed:", error);
        });
      }
      // Domains bought or renewed through Shopinbos (purpose domain_purchase / domain_renewal): verified and
      // completed idempotently, the same as the callback; the registrar is only called after a verified payment.
      if (ref.startsWith(DOMAIN_REFERENCE_PREFIX)) {
        await completeDomainPayment(ref).catch((error) => {
          console.error("Domain payment completion failed:", error);
        });
      }
      // Business name registrations with CAC: verified the same way here; filing (slow: pictures go along) happens
      // from the callback or the 10-minute cron, never before a verified payment.
      if (ref.startsWith(REGISTRATION_REFERENCE_PREFIX)) {
        await completeRegistrationPayment(ref, { fileNow: false }).catch((error) => {
          console.error("Business registration payment completion failed:", error);
        });
        return NextResponse.json({ received: true });
      }
      // Inline payments carry an amount the buyer's browser chose, so check it against the order before
      // marking it paid. Only a pending order moves, so a retried or replayed event can't undo a later status.
      const pending = await db.retailOrder.findUnique({ where: { id: ref }, select: { id: true, total: true, currency: true, status: true, expiredAt: true } });
      const problem = pending ? retailChargeProblem(pending, event.data ?? {}) : "not a retail order";
      // Paid after it expired unpaid (stock already given back): the same checks as an unpaid order, then take the
      // stock again if it's still there, else flag it for a refund (recoverExpiredOrderPayment logs and tells the seller).
      const expiredCharge = Boolean(pending && pending.status === "cancelled" && pending.expiredAt && !retailChargeProblem({ ...pending, status: "pending" }, event.data ?? {}));
      const late = expiredCharge
        ? await recoverExpiredOrderPayment(ref, { reference: ref }).catch((error) => {
            console.error(`[paystack webhook] late payment for expired order ${ref} failed`, error);
            return "not_expired" as const;
          })
        : null;
      if (pending && problem && !expiredCharge) console.warn(`[paystack webhook] order ${ref} not marked paid: ${problem}`);
      const moved = late === "reinstated"
        ? { count: 1 }
        : problem
        ? { count: 0 }
        : await db.retailOrder.updateMany({
            where: { id: ref, status: { in: [...PAYABLE_ORDER_STATUSES] } },
            data: { status: "paid", paystackStatus: "success", paystackRef: ref },
          });
      // The buyer's and seller's messages (once), supplier orders and the payment link (src/lib/commerce/order-paid.server.ts).
      if (moved.count === 1 || (pending && (PAID_RETAIL_STATUSES as readonly string[]).includes(pending.status))) {
        await afterRetailOrderPaid(ref, moved.count === 1, "paystack webhook");
      }
    }
  }

  // ── Refunds we started (a payment that arrived after its order expired and the stock sold) ──
  if (eventType?.startsWith("refund.")) {
    await applyRefundEvent(eventType, event.data ?? {}).catch((error) => {
      console.error(`[paystack webhook] ${eventType} could not be applied`, error);
    });
  }

  return new NextResponse("OK", { status: 200 });
}
