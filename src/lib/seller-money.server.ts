import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { sellerBalance } from "@/lib/commerce/payment-split.server";
import { formatFromAddress, sendEmail } from "@/lib/notifications/resend";
import { appBase, SENDER_STORE_SELECT, storeSender } from "@/lib/email/compliance.server";
import { invoiceEmail } from "@/lib/email/store-emails";
import { isOnlinePayment, PAID_STATUSES, readPayoutBankSummary, WAITING_STATUSES } from "@shared/seller-payments";
import { addManualInvoice, buildManualInvoice, readManualInvoices, type ManualInvoice, type ManualInvoiceInput } from "@/lib/seller-invoices";

// The seller's Payouts and Invoices lists, for the phone app (GET /api/app/payouts, /api/app/invoices) with the same
// numbers as the web pages /home/payouts and /home/invoices; and saving a hand-made invoice (both).

const PAID = PAID_STATUSES as readonly string[];
const WAITING = WAITING_STATUSES as readonly string[];

/** Paid orders (latest 100), split into paid online (Paystack, to the payout bank) and collected by the seller. */
export async function sellerPayouts(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } });
  const orders = store
    ? await db.retailOrder.findMany({
        where: { storeId: store.id, status: { in: [...PAID_STATUSES] } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, orderNumber: true, buyerName: true, total: true, status: true, paymentMethod: true, createdAt: true },
      })
    : [];
  const rows = orders.map((order) => ({ ...order, total: Number(order.total), online: isOnlinePayment(order.paymentMethod), createdAt: order.createdAt.toISOString() }));
  const online = rows.filter((order) => order.online);
  const offline = rows.filter((order) => !order.online);
  const sum = (list: typeof rows) => list.reduce((total, order) => total + order.total, 0);
  return {
    hasStore: Boolean(store),
    bank: readPayoutBankSummary(store?.brandSettings),
    // Split payments: + the seller owes from refunded orders (taken from their next online sales), - Shopinbos owes them.
    splitBalance: store ? await sellerBalance(store.id).catch(() => 0) : 0,
    online: { total: sum(online), count: online.length },
    offline: { total: sum(offline), count: offline.length },
    orders: rows,
  };
}

/** Every order's invoice (latest 100) and the invoices the seller made by hand. Null when there's no store. */
export async function sellerInvoices(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } });
  if (!store) return null;
  const orders = await db.retailOrder.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, subtotal: true, shippingFee: true, total: true, currency: true, status: true, createdAt: true },
  });
  const rows = orders.map((order) => ({
    ...order,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    total: Number(order.total),
    createdAt: order.createdAt.toISOString(),
  }));
  const waiting = rows.filter((order) => WAITING.includes(order.status));
  return {
    summary: {
      orders: rows.length,
      waiting: { total: waiting.reduce((total, order) => total + order.total, 0), count: waiting.length },
      paid: rows.filter((order) => PAID.includes(order.status)).length,
      totalOrdered: rows.reduce((total, order) => total + order.total, 0),
    },
    orders: rows,
    manual: readManualInvoices(store.brandSettings),
  };
}

/** Saves a hand-made invoice and, when it's one the seller sends and has an email, emails it. Null when there's no store. */
export async function createManualInvoice(user: { id: string; email?: string | null }, input: ManualInvoiceInput): Promise<{ invoice: ManualInvoice; emailed: boolean } | null> {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: SENDER_STORE_SELECT });
  if (!store) return null;
  const invoice = buildManualInvoice(input);
  const settings = typeof store.brandSettings === "object" && store.brandSettings && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const manualInvoices = addManualInvoice(invoice, readManualInvoices(settings));
  await db.store.update({ where: { id: store.id }, data: { brandSettings: { ...settings, manualInvoices } as Prisma.InputJsonValue } });

  let emailed = false;
  if (invoice.direction === "sent" && invoice.partyEmail) {
    const amount = "₦" + Math.round(invoice.amount).toLocaleString("en-US");
    const html = invoiceEmail({ appUrl: appBase(), store: storeSender(store), invoiceId: invoice.id, description: invoice.description, amount });
    emailed = await sendEmail({
      to: [invoice.partyEmail],
      subject: `${store.name} invoice ${invoice.id}`,
      html,
      from: formatFromAddress(store.name),
      replyTo: user.email ?? undefined,
    })
      .then((result) => result.success)
      .catch((error) => {
        console.error("[invoices] email not sent", error);
        return false;
      });
  }
  return { invoice, emailed };
}
