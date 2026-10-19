import "server-only";

import { db } from "@/lib/db/client";
import { MARKETING_STORE_SELECT, storeUrl } from "@/lib/marketing/brand";
import { textSender, type SendOutcome, type TextSender } from "@/lib/marketing/channels";
import { fillVariables, firstName, type FlowVariables } from "@/lib/marketing/flows";
import { getMessagingSettings } from "@/lib/marketing/messaging-settings";
import { loadOptOuts } from "@/lib/marketing/opt-outs";
import { normalizePhone } from "@/lib/marketing/segment-rules";
import { CUSTOMER_EVENTS, customerEventFor, mayText, type CustomerEvent, type CustomerEventSetting, type OptOutLookup, type TextChannel, type VariableValues } from "@/lib/marketing/text-channels";
import { refreshTemplateStatus, resolvePresetTemplate, resolveTemplate, sendTemplate } from "@/lib/marketing/whatsapp-templates.server";

// Order and cart messages to a store's customers by WhatsApp and/or SMS, as the seller switched on in
// Marketing › Order messages (StoreMessagingSettings.transactional). Order code calls one function,
// notifyOrderCustomer(orderId, status), right where it already sends the email or runs automations; abandoned
// carts are swept by the marketing cron. Rules:
//   - never without the buyer's phone (given at checkout);
//   - order messages may go to that phone without a marketing opt-in, but never after a full STOP;
//   - WhatsApp uses the approved template chosen for the event (else the store's approved template from the
//     matching ready-made one, which src/lib/marketing/order-messages-setup.server.ts submits when WhatsApp is
//     connected); a template still pending here is re-checked with Meta first; SMS uses the seller's text;
//   - each event goes out once per order (or cart) per channel (CustomerMessage, unique), and every outcome,
//     including "skipped" with the reason, is recorded so the seller sees it on the Order messages page.

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount);

type Store = { id: string; name: string; slug: string; customDomain: string | null };

interface Recipient {
  event: CustomerEvent;
  refId: string;
  phone: string;
  name: string | null;
  values: VariableValues;
  smsVars: Record<string, string>;
}

/** Claims the (event, order, channel) slot; false when it was already sent or attempted. */
async function claim(storeId: string, recipient: Recipient, channel: TextChannel) {
  const key = { storeId, event: recipient.event, refId: recipient.refId, channel };
  if (await db.customerMessage.findUnique({ where: { storeId_event_refId_channel: key }, select: { id: true } })) return null;
  // The unique index still settles a race between two callers.
  const row = await db.customerMessage
    .create({ data: { storeId, event: recipient.event, refId: recipient.refId, channel, to: recipient.phone }, select: { id: true } })
    .catch(() => null);
  return row?.id ?? null;
}

async function finish(id: string, outcome: SendOutcome | { ok: false; error: string; skipped: true }, templateId?: string | null) {
  await db.customerMessage
    .update({
      where: { id },
      data: outcome.ok
        ? { status: "sent", sentAt: new Date(), externalId: outcome.externalId, error: null, templateId: templateId ?? null }
        : { status: "skipped" in outcome ? "skipped" : "failed", error: outcome.error.slice(0, 300), templateId: templateId ?? null },
    })
    .catch(() => null);
}

async function deliver(store: Store, setting: CustomerEventSetting, recipient: Recipient, optOuts: OptOutLookup, sender: () => Promise<TextSender>) {
  const results: Array<{ channel: TextChannel; ok: boolean; error?: string }> = [];
  for (const channel of ["whatsapp", "sms"] as const) {
    if (!setting[channel]) continue;
    const allowed = mayText({ channel, phone: recipient.phone, purpose: "transactional", consent: true, optOuts });
    const id = await claim(store.id, recipient, channel);
    if (!id) continue; // Already sent for this order.
    if (!allowed.ok) {
      await finish(id, { ok: false, error: allowed.reason, skipped: true });
      results.push({ channel, ok: false, error: allowed.reason });
      continue;
    }
    const send = await sender();
    if (channel === "whatsapp") {
      const preset = CUSTOMER_EVENTS.find((e) => e.key === recipient.event)!.preset;
      let template = (setting.templateId ? await resolveTemplate(store.id, setting.templateId) : null) ?? (await resolvePresetTemplate(store.id, preset));
      // Meta may have approved it since we last looked (approval usually takes minutes, and comes by webhook).
      if (template && template.status === "PENDING") template = (await refreshTemplateStatus(store.id, template.id)) ?? template;
      if (!template || template.status !== "APPROVED") {
        const error = template ? `The WhatsApp template "${template.name}" isn't approved (${template.status.toLowerCase()})` : "No approved WhatsApp template for this message. Pick one in Marketing › Order messages.";
        await finish(id, { ok: false, error, skipped: true }, template?.id);
        results.push({ channel, ok: false, error });
        continue;
      }
      const outcome = await sendTemplate(send, template, recipient.phone, { values: recipient.values }).catch((error): SendOutcome => ({ ok: false, error: String(error) }));
      await finish(id, outcome, template.id);
      results.push({ channel, ok: outcome.ok, ...(outcome.ok ? {} : { error: outcome.error }) });
    } else {
      const body = fillVariables(setting.smsText, recipient.smsVars as FlowVariables, "text").replace(/\s{2,}/g, " ").trim();
      const outcome = await send.sms(recipient.phone, body).catch((error): SendOutcome => ({ ok: false, error: String(error) }));
      await finish(id, outcome);
      results.push({ channel, ok: outcome.ok, ...(outcome.ok ? {} : { error: outcome.error }) });
    }
  }
  return results;
}

/**
 * Sends the WhatsApp / SMS message for an order event, if the seller turned it on. `status` is the order's new
 * status ("paid", "shipped", "delivered") or an event name ("order_confirmed", "payment_received"); anything
 * else is ignored. Never throws and never blocks the order change on a failure.
 */
export async function notifyOrderCustomer(orderId: string, status: string) {
  try {
    const event = customerEventFor(status);
    if (!event || event === "abandoned_cart") return [];
    const order = await db.retailOrder.findUnique({
      where: { id: orderId },
      select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerPhone: true, total: true, currency: true, trackingCode: true, logisticsDetails: true },
    });
    const phone = normalizePhone(order?.buyerPhone);
    if (!order || !phone) return [];
    const settings = await getMessagingSettings(order.storeId);
    const setting = settings.transactional[event];
    if (!setting.whatsapp && !setting.sms) return [];
    const store = await db.store.findUnique({ where: { id: order.storeId }, select: MARKETING_STORE_SELECT });
    if (!store) return [];

    const details = order.logisticsDetails && typeof order.logisticsDetails === "object" ? (order.logisticsDetails as Record<string, unknown>) : {};
    const orderLink = storeUrl(store, `/order/${order.id}`);
    const trackingCode = order.trackingCode || (typeof details.trackingCode === "string" ? details.trackingCode : "") || order.orderNumber;
    const trackingLink = typeof details.trackingUrl === "string" && /^https:\/\//.test(details.trackingUrl) ? details.trackingUrl : orderLink;
    const total = money(Number(order.total) || 0, order.currency);
    const first = firstName(order.buyerName) || "there";
    const recipient: Recipient = {
      event,
      refId: order.id,
      phone,
      name: order.buyerName,
      values: { first_name: first, store_name: store.name, order_number: order.orderNumber, order_total: total, order_link: orderLink, tracking_code: trackingCode, tracking_link: trackingLink, link: storeUrl(store) },
      smsVars: { name: first, store: store.name, order_number: order.orderNumber, order_total: total, tracking_code: trackingCode, tracking_link: trackingLink, store_url: storeUrl(store), order_url: orderLink },
    };
    let cached: TextSender | null = null;
    const sender = async () => (cached ??= await textSender(store, { senderId: settings.smsSenderId }));
    return await deliver(store, setting, recipient, await loadOptOuts(store.id), sender);
  } catch (error) {
    console.error(`[customer messages] ${status} for order ${orderId} failed`, error);
    return [];
  }
}

/** The SMS for a shop order sent in more than one parcel, when the first parcel leaves. */
export const PARTLY_SENT_SMS = "{{store}}: part of your order {{order_number}} is on its way. We'll text you when the rest is sent. {{order_url}}";

/**
 * "Part of your order is on its way" by SMS, once per order, when the seller turned on the "Shipped" order
 * message (src/lib/supplier-orders/parts.server.ts calls it when the first parcel of a mixed order leaves). The
 * full "on its way" message waits until every parcel has left. WhatsApp needs an approved template for each
 * wording, so the partial update goes by SMS only. Never throws.
 */
export async function notifyOrderCustomerPartlySent(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerPhone: true } });
    const phone = normalizePhone(order?.buyerPhone);
    if (!order || !phone) return [];
    const settings = await getMessagingSettings(order.storeId);
    if (!settings.transactional.order_shipped.sms) return [];
    const store = await db.store.findUnique({ where: { id: order.storeId }, select: MARKETING_STORE_SELECT });
    if (!store) return [];
    const recipient = { event: "order_partly_shipped" as CustomerEvent, refId: order.id, phone, name: order.buyerName, values: {}, smsVars: {} } satisfies Recipient;
    const id = await claim(store.id, recipient, "sms");
    if (!id) return [];
    const allowed = mayText({ channel: "sms", phone, purpose: "transactional", consent: true, optOuts: await loadOptOuts(store.id) });
    if (!allowed.ok) {
      await finish(id, { ok: false, error: allowed.reason, skipped: true });
      return [{ channel: "sms" as const, ok: false, error: allowed.reason }];
    }
    const body = fillVariables(PARTLY_SENT_SMS, { store: store.name, order_number: order.orderNumber, order_url: storeUrl(store, `/order/${order.id}`) } as unknown as FlowVariables, "text").replace(/\s{2,}/g, " ").trim();
    const send = await textSender(store, { senderId: settings.smsSenderId });
    const outcome = await send.sms(phone, body).catch((error): SendOutcome => ({ ok: false, error: String(error) }));
    await finish(id, outcome);
    return [{ channel: "sms" as const, ok: outcome.ok }];
  } catch (error) {
    console.error(`[customer messages] partly sent for order ${orderId} failed`, error);
    return [];
  }
}

/**
 * Abandoned carts with a phone, left 1 to 24 hours ago and not paid for: one WhatsApp/SMS reminder each, for
 * stores that turned it on. A channel the store's own abandoned-cart automation already texts on is skipped,
 * so nobody gets the same reminder twice.
 */
export async function sweepAbandonedCartMessages(now = new Date()) {
  const rows = await db.storeMessagingSettings.findMany({ select: { storeId: true, transactional: true } });
  let sent = 0;
  for (const row of rows) {
    const settings = await getMessagingSettings(row.storeId);
    const setting = { ...settings.transactional.abandoned_cart };
    if (!setting.whatsapp && !setting.sms) continue;
    const flows = await db.automationRule.findMany({ where: { storeId: row.storeId, active: true, trigger: "abandoned_checkout" }, select: { actionConfig: true } });
    const flowSteps = JSON.stringify(flows.map((f) => f.actionConfig));
    if (flowSteps.includes('"send_whatsapp"')) setting.whatsapp = false;
    if (flowSteps.includes('"send_sms"')) setting.sms = false;
    if (!setting.whatsapp && !setting.sms) continue;
    const store = await db.store.findUnique({ where: { id: row.storeId }, select: MARKETING_STORE_SELECT });
    if (!store || store.status !== "active") continue;
    const carts = await db.abandonedCartEvent.findMany({
      where: { storeId: row.storeId, recoveredAt: null, phone: { not: null }, createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000), lte: new Date(now.getTime() - 3_600_000) } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    if (!carts.length) continue;
    const optOuts = await loadOptOuts(row.storeId);
    let cached: TextSender | null = null;
    const sender = async () => (cached ??= await textSender(store, { senderId: settings.smsSenderId }));
    for (const cart of carts) {
      const phone = normalizePhone(cart.phone);
      if (!phone) continue;
      const items = Array.isArray(cart.items)
        ? (cart.items as Array<Record<string, unknown>>).slice(0, 4).map((item) => `${String(item.name ?? "Item")} × ${Number(item.quantity) || 1}`).join(", ")
        : "";
      const cartLink = cart.recoveryToken ? storeUrl(store, `/cart?recover=${encodeURIComponent(cart.recoveryToken)}`) : storeUrl(store, "/cart");
      const first = firstName(cart.name) || "there";
      const results = await deliver(
        store,
        setting,
        { event: "abandoned_cart", refId: cart.id, phone, name: cart.name, values: { first_name: first, store_name: store.name, cart_link: cartLink, cart_items: items || "your items", link: storeUrl(store) }, smsVars: { name: first, store: store.name, cart_url: cartLink, cart_items: items, store_url: storeUrl(store) } },
        optOuts,
        sender,
      );
      if (results.some((r) => r.ok)) {
        sent++;
        await db.abandonedCartEvent.update({ where: { id: cart.id }, data: { remindersSent: { increment: 1 }, lastReminderAt: new Date() } }).catch(() => null);
      }
    }
  }
  return sent;
}
