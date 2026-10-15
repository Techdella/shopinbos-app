import "server-only";

import { db } from "@/lib/db/client";
import { formatFromAddress, sendEmail, type EmailSendResult } from "@/lib/notifications/resend";
import { appBase, sendPlatformEmail, storeSender, SENDER_STORE_SELECT, type SenderStore } from "./compliance.server";
import { html } from "./shell";
import { leadMagnetEmail, orderConfirmationEmail, orderPartlySentEmail, type OrderEmailInput } from "./store-emails";

// Ready-made sends on the shared shell: a store's order confirmation (B) and the alerts Shopinbos sends sellers (A).

export async function sendOrderConfirmationEmail(input: { store: SenderStore | string; to: string } & Omit<OrderEmailInput, "appUrl" | "store">): Promise<EmailSendResult> {
  const store = typeof input.store === "string" ? await db.store.findUnique({ where: { id: input.store }, select: SENDER_STORE_SELECT }) : input.store;
  if (!store) return { success: false, message: "Store not found" };
  const sender = storeSender(store);
  const { subject, html: body } = orderConfirmationEmail({ ...input, appUrl: appBase(), store: sender });
  return sendEmail({ to: [input.to], subject, html: body, from: formatFromAddress(store.name) });
}

/** "Part of your order is on its way" to the customer (src/lib/supplier-orders/parts.server.ts sends it once). */
export async function sendOrderPartlySentEmail(input: { store: SenderStore | string; to: string } & Omit<Parameters<typeof orderPartlySentEmail>[0], "appUrl" | "store">): Promise<EmailSendResult> {
  const store = typeof input.store === "string" ? await db.store.findUnique({ where: { id: input.store }, select: SENDER_STORE_SELECT }) : input.store;
  if (!store) return { success: false, message: "Store not found" };
  const { subject, html: body } = orderPartlySentEmail({ ...input, appUrl: appBase(), store: storeSender(store) });
  return sendEmail({ to: [input.to], subject, html: body, from: formatFromAddress(store.name) });
}

/** A pop-up's free download, emailed to the person who just signed up for it. */
export async function sendLeadMagnetEmail(input: { store: SenderStore | string; to: string; name: string; url: string; buyerName?: string | null }): Promise<EmailSendResult> {
  const store = typeof input.store === "string" ? await db.store.findUnique({ where: { id: input.store }, select: SENDER_STORE_SELECT }) : input.store;
  if (!store) return { success: false, message: "Store not found" };
  const { subject, html: body } = leadMagnetEmail({ appUrl: appBase(), store: storeSender(store), name: input.name, url: input.url, buyerName: input.buyerName });
  return sendEmail({ to: [input.to], subject, html: body, from: formatFromAddress(store.name) });
}

/**
 * An alert to a seller (new order, form submission…). A notification email: the footer links to their
 * notification settings rather than offering an unsubscribe.
 */
export async function sendSellerNotification(
  to: string | null,
  notification: { title: string; description: string; type?: string; link?: string | null; actionLabel?: string | null },
  user?: { id: string; role?: string | null } | null,
): Promise<EmailSendResult> {
  // Sellers who signed up with a phone number have no email until they add one.
  if (!to) return { success: false, message: "No email address on this account" };
  const url = notification.link ? (/^https?:\/\//.test(notification.link) ? notification.link : `${appBase()}${notification.link.startsWith("/") ? "" : "/"}${notification.link}`) : null;
  return sendPlatformEmail({
    to,
    user: user ?? { id: "", role: "seller" },
    kind: "notification",
    subject: notification.title,
    heading: notification.title,
    eyebrow: notification.type ? notification.type.replace(/_/g, " ") : null,
    preheader: notification.description.slice(0, 140),
    bodyHtml: html.text(notification.description),
    cta: url ? { label: notification.actionLabel || "View details", url } : null,
  });
}
