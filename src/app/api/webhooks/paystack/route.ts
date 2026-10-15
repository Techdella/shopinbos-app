import { sendOrderConfirmationEmail } from "@/lib/email/notices.server";
import { completeCreditPurchase, grantPlanCredits } from "@/lib/ai/credits.server";
import { CREDIT_REFERENCE_PREFIX } from "@shared/ai-credits";
import { SENDER_STORE_SELECT } from "@/lib/email/compliance.server";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { triggerAutomations } from "@/lib/automations/engine";
import crypto from "crypto";
import { completeStoreLaunchPayment } from "@/lib/store-launch-billing";
import { DOMAIN_REFERENCE_PREFIX, completeDomainPayment } from "@/lib/domains/billing.server";
import { creditCampaignConversion } from "@/lib/campaigns/send";
import { notifyOrderCustomer } from "@/lib/notifications/customer-messages";
import { PAYABLE_ORDER_STATUSES, retailChargeProblem } from "@/lib/commerce/paystack-charge";
import { recoverExpiredOrderPayment } from "@/lib/commerce/order-expiry.server";
import { applyRefundEvent } from "@/lib/commerce/refunds.server";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { isDedicatedCharge } from "@/lib/logistics/payin-rules";
import { handleDedicatedAccountAssign, handleDedicatedAccountCharge } from "@/lib/logistics/payins.server";
import { notifyOrderPaid } from "@/lib/notifications/events.server";
import { recordInvoicePaid, recordSubscriptionCreated, recordSubscriptionStatus } from "@/lib/seller-plan.server";

// The plan itself (code, monthly/annual, status, paid-until) is recorded on User for the free-domain rule
// (src/lib/seller-plan.ts). A failure there is logged, never fails the webhook: the credits above still apply.
function recordPlan(work: Promise<unknown>) {
  return work.catch((error) => console.error("[paystack webhook] could not record the seller plan", error));
}

const PLAN_CREDITS: Record<string, number> = {
  PLN_8ou289e71czicvm: 50,   // Seller Growth (monthly)
  PLN_2gph11w3yd0250y: 200,  // Seller Pro (monthly)
  PLN_q78304vgj7p35o6: 100,  // Supplier Max (monthly)
  PLN_q1k3ssxpx7rxxuz: 50,   // Seller Growth Annual
  PLN_9gma70ofldhbj4r: 200,  // Seller Pro Annual
  PLN_0a6z6ns429ohli1: 100,  // Supplier Max Annual
};

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
  if (eventType === "subscription.create") {
    const planCode = event.data?.plan?.plan_code as string | undefined;
    const customerEmail = event.data?.customer?.email as string | undefined;
    if (planCode && customerEmail && PLAN_CREDITS[planCode] !== undefined) {
      const credits = PLAN_CREDITS[planCode];
      await db.user.updateMany({
        where: { email: customerEmail },
        data: { aiCredits: credits },
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
    if (planCode && customerEmail && PLAN_CREDITS[planCode] !== undefined) {
      const credits = PLAN_CREDITS[planCode];
      await db.user.updateMany({
        where: { email: customerEmail },
        data: { aiCredits: credits },
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
        data: { aiCredits: 5 },
      });
    }
    await recordPlan(recordSubscriptionStatus(event.data ?? {}, eventType === "subscription.disable" ? "cancelled" : "non_renewing"));
  }

  // ── Retail order payment (storefront checkout) ────────────────────────────
  if (eventType === "charge.success") {
    const ref = event.data?.reference as string | undefined;
    if (ref) {
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
      if (moved.count === 1) await creditCampaignConversion(ref).catch(() => null);
      if (moved.count === 1) await notifyOrderCustomer(ref, "payment_received"); // WhatsApp/SMS to the buyer, if switched on
      if (moved.count === 1) await notifyOrderPaid(ref); // the seller's bell and phone
      // Dropship items go to their suppliers. Idempotent, so a replayed event (or one that failed half way) is safe.
      if (moved.count === 1 || (pending && (PAID_RETAIL_STATUSES as readonly string[]).includes(pending.status))) {
        await ensureSupplierOrdersSafely(ref);
      }

      const resendKey = process.env.RESEND_API_KEY;
      // The order is already marked paid; a failure in the follow-up email must not 500 the webhook
      // (Paystack would keep retrying an event that was processed).
      try {
        if (moved.count === 1 && resendKey && !resendKey.includes("your_")) {
          const order = await db.retailOrder.findUnique({ where: { id: ref } });
          if (order) {
            const storeData = await db.store.findUnique({ where: { id: order.storeId }, select: SENDER_STORE_SELECT });

            if (storeData && order.buyerEmail) {
              const money = (amount: number) => {
                try {
                  return new Intl.NumberFormat("en-NG", { style: "currency", currency: order.currency, maximumFractionDigits: 0 }).format(amount);
                } catch {
                  return `${order.currency} ${Math.round(amount).toLocaleString("en-NG")}`;
                }
              };
              const items = Array.isArray(order.items) ? (order.items as Array<{ name?: string; quantity?: number; price?: number }>) : [];
              await sendOrderConfirmationEmail({
                store: storeData,
                to: order.buyerEmail,
                buyerName: order.buyerName,
                orderNumber: order.orderNumber,
                items: items.map((item) => ({ name: String(item.name ?? "Item"), qty: Number(item.quantity ?? 1), price: money(Number(item.price ?? 0) * Number(item.quantity ?? 1)) })),
                total: money(Number(order.total)),
                orderUrl: buildStorefrontUrl(storeData, `/order/${order.id}`),
                paymentNote: "Payment received. Thank you!",
              }).catch(() => null);
            }

            Promise.allSettled([
              triggerAutomations("payment_received", {
                storeId: order.storeId,
                storeName: storeData?.name ?? "Store",
                buyerEmail: order.buyerEmail,
                buyerName: order.buyerName,
                orderNumber: order.orderNumber,
                orderTotal: Number(order.total),
                currency: order.currency,
              }),
            ]).catch(() => {});
          }
        }
      } catch (error) {
        console.error("Paystack webhook follow-up failed:", error);
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
