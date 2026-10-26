import "server-only";

import { db } from "@/lib/db/client";
import { getChannel } from "@/lib/inbox/service";
import { sendShopinbosTemplate } from "@/lib/member-messaging/send.server";
import { paystackPhone } from "@/lib/wallet/balance-rules";
import { buyerPaymentText, normalizeCheckoutMethod } from "@shared/checkout-payments";

// The shopper's order summary on WhatsApp for stores that haven't connected their own WhatsApp number: sent from
// Shopinbos's number with the shopinbos_order_summary template (items, total, how to pay, a link to the order).
// Stores with their own number send their own order_confirmation template instead (notifyOrderCustomer). Never
// throws; a template Meta hasn't approved yet is logged and skipped.

export async function sendOrderSummaryWhatsApp(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({
      where: { id: orderId },
      select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerPhone: true, items: true, total: true, currency: true, status: true, paymentMethod: true, store: { select: { name: true } } },
    });
    const phone = paystackPhone(order?.buyerPhone);
    if (!order || !phone || order.status === "cancelled") return false;
    const own = await getChannel(order.storeId, "whatsapp").catch(() => null);
    if (own) return false;
    const money = (amount: number) => {
      try {
        return new Intl.NumberFormat("en-NG", { style: "currency", currency: order.currency, maximumFractionDigits: 0 }).format(amount);
      } catch {
        return `${order.currency} ${Math.round(amount).toLocaleString("en-NG")}`;
      }
    };
    const lines = (Array.isArray(order.items) ? (order.items as Array<{ name?: unknown; quantity?: unknown }>) : []).map((item) => `${Math.max(1, Number(item.quantity) || 1)} × ${String(item.name ?? "Item")}`);
    const items = lines.length > 6 ? `${lines.slice(0, 6).join(", ")} and ${lines.length - 6} more` : lines.join(", ") || "Your items";
    const paid = order.status !== "pending";
    const first = (order.buyerName ?? "").trim().split(/\s+/)[0] || "there";
    return await sendShopinbosTemplate(
      "shopinbos_order_summary",
      phone,
      [first, order.store.name, order.orderNumber, items, money(Number(order.total) || 0), paid ? "It's paid. Thank you!" : buyerPaymentText(normalizeCheckoutMethod(order.paymentMethod))],
      order.id,
    );
  } catch (error) {
    console.warn(`[order summary whatsapp] ${orderId}`, error instanceof Error ? error.message : error);
    return false;
  }
}
