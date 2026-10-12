import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { triggerAutomations } from "@/lib/automations/engine";
import crypto from "crypto";
import { completeStoreLaunchPayment } from "@/lib/store-launch-billing";
import { creditCampaignConversion } from "@/lib/campaigns/send";
import { PAYABLE_ORDER_STATUSES, retailChargeProblem } from "@/lib/commerce/paystack-charge";
import { recoverExpiredOrderPayment } from "@/lib/commerce/order-expiry.server";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";

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
    }
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
  }

  // ── Retail order payment (storefront checkout) ────────────────────────────
  if (eventType === "charge.success") {
    const ref = event.data?.reference as string | undefined;
    if (ref) {
      if (ref.startsWith("store-launch-")) {
        await completeStoreLaunchPayment(ref).catch((error) => {
          console.error("Store launch payment completion failed:", error);
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
            const storeData = await db.store.findUnique({
              where: { id: order.storeId },
              select: { name: true, slug: true, customDomain: true },
            });

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: process.env.RESEND_FROM_EMAIL ?? "Shopinbos <noreply@shopinbos.com>",
                to: [order.buyerEmail],
                subject: `Order Confirmed - ${order.orderNumber}`,
                html: buildOrderConfirmationEmail(order, storeData),
              }),
            }).catch(() => null);

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

  return new NextResponse("OK", { status: 200 });
}

function buildOrderConfirmationEmail(order: any, store: any) {
  const escapeHtml = (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const items = (order.items as any[])
    .map((i: any) => `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.quantity)}</td><td>${escapeHtml(order.currency)} ${(i.price * i.quantity).toLocaleString()}</td></tr>`)
    .join("");
  const orderUrl = store ? buildStorefrontUrl(store, `/order/${order.id}`) : "";

  return `
    <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px">
      <h2>Order Confirmed</h2>
      <p>Hi ${escapeHtml(order.buyerName)}, your order from <strong>${escapeHtml(store?.name ?? "the store")}</strong> is confirmed.</p>
      <p><strong>Order #${escapeHtml(order.orderNumber)}</strong></p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr style="background:#f4f1ea"><th>Item</th><th>Qty</th><th>Total</th></tr></thead>
        <tbody>${items}</tbody>
      </table>
      <p><strong>Total: ${escapeHtml(order.currency)} ${Number(order.total).toLocaleString()}</strong></p>
      <p style="color:#6e6e68;font-size:13px">Track your order at: <a href="${escapeHtml(orderUrl)}">${escapeHtml(orderUrl)}</a></p>
    </div>
  `;
}
