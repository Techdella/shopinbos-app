import "server-only";
import { db } from "@/lib/db/client";
import { sendOrderConfirmationEmail } from "@/lib/email/notices.server";
import { SENDER_STORE_SELECT } from "@/lib/email/compliance.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { triggerAutomations } from "@/lib/automations/engine";
import { creditCampaignConversion } from "@/lib/campaigns/send";
import { notifyOrderCustomer } from "@/lib/notifications/customer-messages";
import { notifyOrderPaid } from "@/lib/notifications/events.server";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { settlePaymentLinkForOrder } from "@/lib/payment-links/service.server";
import { recordOrderShares } from "@/lib/wallet/wallet.server";
import { storeHasDeposit } from "@shared/preorder";
import { afterStoreDepositPaid } from "@/lib/commerce/store-balance.server";

// What happens once a storefront order's online payment is confirmed (the Paystack webhook). `newlyPaid` is true only for the caller that moved the order to paid, so the buyer and seller hear about
// it once; the supplier orders and payment link are idempotent and run again on replays. Only settling the payment
// link can throw (the database was unreachable), so a webhook answers 500 and its retry settles it.

export async function afterRetailOrderPaid(orderId: string, newlyPaid: boolean, logTag: string) {
  // A preorder paid with a deposit (shared/preorder.ts): this payment was the deposit part. The order is confirmed
  // (seller told, campaign and rewards credited, the deposit's shares recorded) but the shopper hears "deposit
  // received" instead of "payment received", and suppliers / delivery wait for the balance
  // (ensureSupplierOrdersSafely checks). src/lib/commerce/store-balance.server.ts has the rest.
  const deposit = await db.retailOrder.findUnique({ where: { id: orderId }, select: { depositKobo: true, balanceKobo: true } }).then((row) => Boolean(row && storeHasDeposit(row))).catch(() => false);
  if (newlyPaid) {
    await creditCampaignConversion(orderId).catch(() => null);
    if (!deposit) await notifyOrderCustomer(orderId, "payment_received").catch(() => null); // WhatsApp/SMS to the buyer, if switched on
    await notifyOrderPaid(orderId).catch(() => null); // the seller's bell and phone (says "deposit" for a deposit)
    void import("@/lib/rewards/rewards.server").then((rewards) => rewards.rewardOrderPaid(orderId)).catch(() => undefined);
  }
  // Email + SMS to the shopper: deposit received, the rest when it's ready (once, whoever recorded the payment).
  if (deposit) await afterStoreDepositPaid(orderId);
  // Dropship items go to their suppliers. Idempotent, so a replayed event (or one that failed half way) is safe.
  await ensureSupplierOrdersSafely(orderId);
  // Paid through a payment link: the link counts the sale (a one-time link closes). Idempotent.
  await settlePaymentLinkForOrder(orderId);
  // Each business's share of the split goes on its wallet statement (once).
  await recordOrderShares(orderId);
  if (!newlyPaid || deposit) return;

  const resendKey = process.env.RESEND_API_KEY;
  // The order is already marked paid; a failure in the follow-up email must not fail the caller (a webhook would
  // keep retrying an event that was processed).
  try {
    if (!resendKey || resendKey.includes("your_")) return;
    const order = await db.retailOrder.findUnique({ where: { id: orderId } });
    if (!order) return;
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
        paid: true,
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
  } catch (error) {
    console.error(`[${logTag}] follow-up for paid order ${orderId} failed:`, error);
  }
}
