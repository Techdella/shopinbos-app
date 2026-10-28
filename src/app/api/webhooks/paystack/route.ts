import { PAY_AT_DOOR_PREFIX } from "@shared/pay-at-door";
import { confirmPayAtDoor } from "@/lib/commerce/pay-at-door.server";
import { completeExtraPurchase } from "@/lib/plans/extras.server";
import { confirmCardTopUp, handleWalletAccountAssign, handleWalletAccountCharge, handleWalletTransfer } from "@/lib/wallet/balance.server";
import { WALLET_REFERENCE } from "@/lib/wallet/balance-rules";
import { EXTRA_REFERENCE_PREFIX } from "@shared/plan-extras";
import { completeCreditPurchase, grantPlanCredits } from "@/lib/ai/credits.server";
import { CREDIT_REFERENCE_PREFIX } from "@shared/ai-credits";
import { THEME_REFERENCE_PREFIX } from "@shared/theme-purchase";
import { completeThemePurchase } from "@/lib/themes/purchase.server";
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
import { WHOLESALE_PAY_PREFIX, confirmWholesalePayment } from "@/lib/supplier-orders/wholesale-payments.server";
import { DEBT_PAYMENT_PREFIX, confirmDebtPayment } from "@/lib/money-owed/money-owed.server";
import { confirmStoreBalancePayment } from "@/lib/commerce/store-balance.server";
import { STORE_BALANCE_PREFIX } from "@shared/preorder";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { isDedicatedCharge } from "@/lib/logistics/payin-rules";
import { handleDedicatedAccountAssign, handleDedicatedAccountCharge } from "@/lib/logistics/payins.server";
import { notifyRenewalFailed, recordInvoicePaid, recordSubscriptionCreated, recordSubscriptionStatus } from "@/lib/seller-plan.server";
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
      // A business's wallet top-up account first (src/lib/wallet/balance.server.ts), else a partner's old pay-in account.
      if (eventType === "charge.success") {
        if (!(await handleWalletAccountCharge(event.data))) await handleDedicatedAccountCharge(event.data);
      } else if (!(await handleWalletAccountAssign(eventType, event.data))) await handleDedicatedAccountAssign(eventType, event.data);
    } catch (error) {
      console.error(`[paystack webhook] pay-in account event ${eventType} failed`, error);
      return new NextResponse("Retry later", { status: 500 });
    }
    return new NextResponse("OK", { status: 200 });
  }

  // ── Prepaid wallet: card top-ups and withdrawals to the bank (src/lib/wallet/balance.server.ts) ──
  // Both idempotent on the reference, so a 500 is safe for Paystack to retry.
  if (eventType === "charge.success" && typeof event.data?.reference === "string" && event.data.reference.startsWith(WALLET_REFERENCE.topUp)) {
    const result = await confirmCardTopUp(event.data.reference).catch((error) => {
      console.error(`[paystack webhook] wallet top-up ${event.data.reference} failed`, error);
      return "retry" as const;
    });
    return result === "retry" ? new NextResponse("Retry later", { status: 500 }) : new NextResponse("OK", { status: 200 });
  }
  if (eventType === "transfer.success" || eventType === "transfer.failed" || eventType === "transfer.reversed") {
    try {
      if (await handleWalletTransfer(eventType, event.data)) return new NextResponse("OK", { status: 200 });
    } catch (error) {
      console.error(`[paystack webhook] wallet withdrawal ${eventType} failed`, error);
      return new NextResponse("Retry later", { status: 500 });
    }
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
    await notifyRenewalFailed(event.data ?? {}).catch((error) => console.error("[paystack webhook] renewal failed notice", error));
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

  // ── A wholesale order a seller paid by card (split to the supplier's own bank) ──
  if (eventType === "charge.success" && typeof event.data?.reference === "string" && event.data.reference.startsWith(WHOLESALE_PAY_PREFIX)) {
    const result = await confirmWholesalePayment(event.data.reference).catch((error) => ({ ok: false as const, error: String(error), retry: true }));
    if (!result.ok && result.retry) return new NextResponse("Retry later", { status: 500 });
    if (!result.ok) console.warn(`[paystack webhook] wholesale payment ${event.data.reference} not applied: ${result.error}`);
    return new NextResponse("OK", { status: 200 });
  }

  // ── The rest of a store preorder a shopper paid by card (its own reference; split to the seller's own bank) ──
  // Idempotent: balanceRef is unique and set once, conditional on the balance still being due, so a replayed event
  // (or the return page confirming it first) records nothing twice; a 500 (Paystack or the database unreachable) is
  // safe for Paystack to retry.
  if (eventType === "charge.success" && typeof event.data?.reference === "string" && event.data.reference.startsWith(STORE_BALANCE_PREFIX)) {
    const result = await confirmStoreBalancePayment(event.data.reference).catch((error) => ({ ok: false as const, error: String(error), retry: true }));
    if (!result.ok && "retry" in result && result.retry) return new NextResponse("Retry later", { status: 500 });
    if (!result.ok) console.warn(`[paystack webhook] store balance ${event.data.reference} not applied: ${result.error}`);
    return new NextResponse("OK", { status: 200 });
  }

  // ── Pay on delivery paid at the door (its own reference; split like a card checkout) ──
  // Idempotent: the order moves once (paystackRef set, conditional on it still being due), so a replay or the return
  // page confirming it first records nothing twice; a 500 (Paystack or the database unreachable) is safe to retry.
  if (eventType === "charge.success" && typeof event.data?.reference === "string" && event.data.reference.startsWith(PAY_AT_DOOR_PREFIX)) {
    const result = await confirmPayAtDoor(event.data.reference).catch((error) => ({ ok: false as const, error: String(error), retry: true }));
    if (!result.ok && "retry" in result && result.retry) return new NextResponse("Retry later", { status: 500 });
    if (!result.ok) console.warn(`[paystack webhook] pay at door ${event.data.reference} not applied: ${result.error}`);
    return new NextResponse("OK", { status: 200 });
  }

  // ── Money one business owed another, paid in the app (split to the creditor's own bank) ──
  if (eventType === "charge.success" && typeof event.data?.reference === "string" && event.data.reference.startsWith(DEBT_PAYMENT_PREFIX)) {
    const result = await confirmDebtPayment(event.data.reference).catch((error) => ({ ok: false as const, error: String(error), retry: true }));
    if (!result.ok && result.retry) return new NextResponse("Retry later", { status: 500 });
    if (!result.ok) console.warn(`[paystack webhook] debt payment ${event.data.reference} not applied: ${result.error}`);
    return new NextResponse("OK", { status: 200 });
  }

  // ── Retail order payment (storefront checkout) ────────────────────────────
  if (eventType === "charge.success") {
    const ref = event.data?.reference as string | undefined;
    if (ref) {
      // Ads setup fees and print orders (both can be paid from the phone app): idempotent on the reference, so when
      // Paystack or the database can't be reached a 500 asks Paystack to send the event again.
      if (ref.startsWith(AD_SETUP_REFERENCE_PREFIX)) {
        const done = await completeAdSetupPayment(ref).catch((error) => {
          console.error("Ad setup payment completion failed:", error);
          return "retry" as const;
        });
        return done === "retry" ? new NextResponse("Retry later", { status: 500 }) : NextResponse.json({ received: true });
      }
      if (ref.startsWith(PRINT_ORDER_REFERENCE_PREFIX)) {
        const done = await completePrintOrderPayment(ref).catch((error) => {
          console.error("Print order payment completion failed:", error);
          return "retry" as const;
        });
        return done === "retry" ? new NextResponse("Retry later", { status: 500 }) : NextResponse.json({ received: true });
      }
      if (ref.startsWith(THEME_REFERENCE_PREFIX)) {
        await completeThemePurchase(ref).catch((error) => {
          console.error("Theme purchase completion failed:", error);
        });
        return NextResponse.json({ received: true });
      }
      if (ref.startsWith(EXTRA_REFERENCE_PREFIX)) {
        await completeExtraPurchase(ref).catch((error) => {
          console.error("Plan add-on purchase completion failed:", error);
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
      // A preorder deposit order was charged its deposit part, not the total (retailChargeProblem checks that amount).
      const pending = await db.retailOrder.findUnique({ where: { id: ref }, select: { id: true, total: true, currency: true, status: true, expiredAt: true, depositKobo: true, balanceKobo: true } });
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
