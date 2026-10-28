import "server-only";
import { brandedTrackingFor } from "@/lib/plans/gates.server";

import { db } from "@/lib/db/client";
import { MARKETING_STORE_SELECT, storeUrl } from "@/lib/marketing/brand";
import { textSender, type SendOutcome, type TextSender } from "@/lib/marketing/channels";
import { fillVariables, firstName, type FlowVariables } from "@/lib/marketing/flows";
import { getMessagingSettings } from "@/lib/marketing/messaging-settings";
import { loadOptOuts } from "@/lib/marketing/opt-outs";
import { normalizePhone } from "@/lib/marketing/segment-rules";
import { CUSTOMER_EVENTS, customerEventFor, mayText, type CustomerEvent, type CustomerEventSetting, type OptOutLookup, type TextChannel, type VariableValues } from "@/lib/marketing/text-channels";
import { refreshTemplateStatus, resolvePresetTemplate, resolveTemplate, sendTemplate } from "@/lib/marketing/whatsapp-templates.server";
import { deliveryEventFor, deliveryMessage } from "./delivery-messages";
import { payAtDoorDue } from "@shared/pay-at-door";

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
    const store = await db.store.findUnique({ where: { id: order.storeId }, select: { ...MARKETING_STORE_SELECT, userId: true } });
    if (!store) return [];

    const details = order.logisticsDetails && typeof order.logisticsDetails === "object" ? (order.logisticsDetails as Record<string, unknown>) : {};
    const orderLink = storeUrl(store, `/order/${order.id}`);
    const trackingCode = order.trackingCode || (typeof details.trackingCode === "string" ? details.trackingCode : "") || order.orderNumber;
    // Branded tracking (Starter and up) keeps customers on the store's own order page; otherwise the delivery
    // partner's tracking page is used when they gave one.
    const branded = await brandedTrackingFor(store.userId).catch(() => false);
    const trackingLink = !branded && typeof details.trackingUrl === "string" && /^https:\/\//.test(details.trackingUrl) ? details.trackingUrl : orderLink;
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

/**
 * Delivery partner updates to the buyer (Logistics marketplace, spec §6.3), as the seller switched them on in
 * Marketing › Order messages: booked (the partner accepted), out for delivery (with the delivery code), ready at
 * the pickup point (where, hours and the code) and delivery problems (a failed attempt in plain words, or a
 * return). transitionJob (src/lib/logistics/jobs.ts) calls it after it saves a job's new status. Only jobs on a
 * store order; never for a job another partner took over. Same rules as notifyOrderCustomer: the buyer's
 * checkout phone only, never after STOP, once per job step per channel (src/lib/notifications/delivery-messages.ts
 * has the dedupe keys). "Delivered" is the order's own message, sent when the job moves the order to delivered.
 * Never throws.
 */
export async function notifyDeliveryStage(bookingId: string, to: string) {
  try {
    if (!deliveryEventFor(to)) return [];
    const job = await db.deliveryBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, orderId: true, status: true, replacedById: true, deliveryCode: true, service: true, pickupPointId: true, connectionId: true, failedReason: true, failedAttempts: true, logisticsPartner: { select: { displayName: true } } },
    });
    // Moved on again before we got here (or handed to another partner): that step speaks for itself.
    if (!job?.orderId || job.replacedById || job.status !== to) return [];
    const order = await db.retailOrder.findUnique({ where: { id: job.orderId }, select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerPhone: true, status: true, paymentMethod: true, paystackStatus: true } });
    const phone = normalizePhone(order?.buyerPhone);
    if (!order || !phone || order.status === "cancelled") return [];
    // Pay on delivery not paid yet (shared/pay-at-door.ts): the code is only for a customer who has paid. When the
    // parcel goes out (or reaches the pickup point) they get the payment link instead, whatever the shop's settings.
    const unpaid = payAtDoorDue(order);
    if (unpaid && (to === "out_for_delivery" || to === "at_pickup_point")) return await textPayAtDoorLink(order.id);
    const event = deliveryEventFor(to)!;
    const settings = await getMessagingSettings(order.storeId);
    const setting = settings.transactional[event];
    if (!setting.whatsapp && !setting.sms) return [];
    const store = await db.store.findUnique({ where: { id: order.storeId }, select: MARKETING_STORE_SELECT });
    if (!store) return [];

    const connection = job.connectionId
      ? await db.deliveryConnection.findUnique({ where: { id: job.connectionId }, select: { showPartnerName: true, label: true } })
      : null;
    const point = to === "at_pickup_point" && job.pickupPointId
      ? await db.logisticsPickupPoint.findUnique({ where: { id: job.pickupPointId }, select: { name: true, address: true, area: true, hours: true } })
      : null;
    const message = deliveryMessage({
      status: to,
      bookingId: job.id,
      failedAttempts: job.failedAttempts,
      failedReason: job.failedReason,
      deliveryCode: unpaid ? null : job.deliveryCode,
      service: job.service,
      connection: connection ? { ...connection, partnerName: job.logisticsPartner.displayName } : null,
      point,
      buyerName: order.buyerName,
      storeName: store.name,
      orderNumber: order.orderNumber,
      orderLink: storeUrl(store, `/order/${order.id}`),
      storeLink: storeUrl(store),
    });
    if (!message) return [];
    const recipient: Recipient = { event: message.event, refId: message.refId, phone, name: order.buyerName, values: message.values, smsVars: message.smsVars };
    let cached: TextSender | null = null;
    const sender = async () => (cached ??= await textSender(store, { senderId: settings.smsSenderId }));
    return await deliver(store, setting, recipient, await loadOptOuts(store.id), sender);
  } catch (error) {
    console.error(`[customer messages] delivery ${to} for job ${bookingId} failed`, error);
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

/** The SMS with the code for a parcel the supplier delivers itself (sent in the shop's name, since the customer ordered from the shop). */
export const SELF_DELIVERY_SMS = "{{store}}: your order {{order_number}} is on its way. When it arrives, give this code to the person delivering it: {{delivery_code}}. {{order_url}}";

/**
 * The customer's delivery code by SMS, once per parcel, when a supplier sets off to deliver its own parcel
 * (src/lib/supplier-orders/service.server.ts). Sent whatever the shop's order message settings: without it the
 * parcel can't be marked delivered. Never after STOP. The code is also on the customer's order page. Never throws.
 */
export async function textSelfDeliveryCode(orderId: string, code: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerPhone: true } });
    const phone = normalizePhone(order?.buyerPhone);
    if (!order || !phone) return [];
    const store = await db.store.findUnique({ where: { id: order.storeId }, select: MARKETING_STORE_SELECT });
    if (!store) return [];
    const recipient = { event: "order_self_delivery" as CustomerEvent, refId: `${order.id}:${code}`, phone, name: order.buyerName, values: {}, smsVars: {} } satisfies Recipient;
    const id = await claim(store.id, recipient, "sms");
    if (!id) return [];
    const allowed = mayText({ channel: "sms", phone, purpose: "transactional", consent: true, optOuts: await loadOptOuts(store.id) });
    if (!allowed.ok) {
      await finish(id, { ok: false, error: allowed.reason, skipped: true });
      return [{ channel: "sms" as const, ok: false, error: allowed.reason }];
    }
    const settings = await getMessagingSettings(order.storeId);
    const body = fillVariables(SELF_DELIVERY_SMS, { store: store.name, order_number: order.orderNumber, delivery_code: code, order_url: storeUrl(store, `/order/${order.id}`) } as unknown as FlowVariables, "text").replace(/\s{2,}/g, " ").trim();
    const send = await textSender(store, { senderId: settings.smsSenderId });
    const outcome = await send.sms(phone, body).catch((error): SendOutcome => ({ ok: false, error: String(error) }));
    await finish(id, outcome);
    return [{ channel: "sms" as const, ok: outcome.ok }];
  } catch (error) {
    console.error(`[customer messages] self-delivery code for order ${orderId} failed`, error);
    return [];
  }
}

/** Pay on delivery (shared/pay-at-door.ts): the payment link, and the code once paid. Sent in the shop's name. */
export const PAY_AT_DOOR_LINK_SMS = "{{store}}: your order {{order_number}} is on its way. Check it when it arrives, then pay {{amount}} here: {{order_url}} You'll get the code for the rider once it's paid.";
export const PAY_AT_DOOR_CODE_SMS = "{{store}}: payment received for order {{order_number}}. Give the rider this code: {{delivery_code}}. {{order_url}}";

/** One SMS to the customer of an order, transactional, never after STOP; `refId` makes it once per thing. */
async function textOrderCustomer(orderId: string, input: { event: string; refId: string; template: string; values: (order: { orderNumber: string; total: number; currency: string }) => Record<string, string> }) {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerPhone: true, total: true, currency: true } });
  const phone = normalizePhone(order?.buyerPhone);
  if (!order || !phone) return [];
  const store = await db.store.findUnique({ where: { id: order.storeId }, select: MARKETING_STORE_SELECT });
  if (!store) return [];
  const recipient = { event: input.event as CustomerEvent, refId: input.refId, phone, name: order.buyerName, values: {}, smsVars: {} } satisfies Recipient;
  const id = await claim(store.id, recipient, "sms");
  if (!id) return [];
  const allowed = mayText({ channel: "sms", phone, purpose: "transactional", consent: true, optOuts: await loadOptOuts(store.id) });
  if (!allowed.ok) {
    await finish(id, { ok: false, error: allowed.reason, skipped: true });
    return [{ channel: "sms" as const, ok: false, error: allowed.reason }];
  }
  const settings = await getMessagingSettings(order.storeId);
  const values = { store: store.name, order_number: order.orderNumber, order_url: storeUrl(store, `/order/${order.id}`), ...input.values({ ...order, total: Number(order.total) }) };
  const body = fillVariables(input.template, values as unknown as FlowVariables, "text").replace(/\s{2,}/g, " ").trim();
  const send = await textSender(store, { senderId: settings.smsSenderId });
  const outcome = await send.sms(phone, body).catch((error): SendOutcome => ({ ok: false, error: String(error) }));
  await finish(id, outcome);
  return [{ channel: "sms" as const, ok: outcome.ok }];
}

const nairaText = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
  }
};

/**
 * The pay-on-delivery payment link (src/lib/commerce/pay-at-door.server.ts): once when the parcel goes out (or reaches
 * the pickup point), and again when the rider asks. Sent whatever the shop's message settings, since without it the
 * parcel can't be handed over. Never throws.
 */
export async function textPayAtDoorLink(orderId: string, options: { resend?: boolean } = {}) {
  try {
    return await textOrderCustomer(orderId, {
      event: "order_pay_at_door",
      refId: options.resend ? `${orderId}:link:${Date.now()}` : `${orderId}:link`,
      template: PAY_AT_DOOR_LINK_SMS,
      values: (order) => ({ amount: nairaText(order.total, order.currency) }),
    });
  } catch (error) {
    console.error(`[customer messages] pay-at-door link for order ${orderId} failed`, error);
    return [];
  }
}

/** The code for the rider, once the customer has paid at the door (once per set of codes). Never throws. */
export async function textPayAtDoorCode(orderId: string, codes: string[]) {
  try {
    const code = codes.join(" or ");
    return await textOrderCustomer(orderId, { event: "order_pay_at_door_code", refId: `${orderId}:code:${codes.join(",")}`, template: PAY_AT_DOOR_CODE_SMS, values: () => ({ delivery_code: code }) });
  } catch (error) {
    console.error(`[customer messages] pay-at-door code for order ${orderId} failed`, error);
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

/** Preorders paid in two parts (shared/preorder.ts): the deposit is in, or the stock is ready and the rest is due. */
export const PREORDER_DEPOSIT_SMS = "{{store}}: we got your deposit of {{paid}} for pre-order {{order_number}}. The rest ({{balance}}) is due when it's ready; we'll send you a link. {{order_url}}";
export const PREORDER_BALANCE_SMS = "{{store}}: your pre-order {{order_number}} is ready. Pay the rest ({{balance}}) here and they send it: {{order_url}}";

/**
 * The preorder deposit / "pay the rest" message by SMS, once per order and kind, when the seller turned on the
 * "Payment received" order message (WhatsApp needs an approved template for each wording, so like the partly-sent
 * update this goes by SMS only; the email always goes). Never throws.
 */
export async function notifyOrderCustomerPreorderPayment(orderId: string, kind: "deposit" | "balance_due", amounts: { paid: string; balance: string }) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, orderNumber: true, buyerName: true, buyerPhone: true } });
    const phone = normalizePhone(order?.buyerPhone);
    if (!order || !phone) return [];
    const settings = await getMessagingSettings(order.storeId);
    if (!settings.transactional.payment_received.sms) return [];
    const store = await db.store.findUnique({ where: { id: order.storeId }, select: MARKETING_STORE_SELECT });
    if (!store) return [];
    const recipient = { event: (kind === "deposit" ? "preorder_deposit" : "preorder_balance_due") as CustomerEvent, refId: order.id, phone, name: order.buyerName, values: {}, smsVars: {} } satisfies Recipient;
    const id = await claim(store.id, recipient, "sms");
    if (!id) return [];
    const allowed = mayText({ channel: "sms", phone, purpose: "transactional", consent: true, optOuts: await loadOptOuts(store.id) });
    if (!allowed.ok) {
      await finish(id, { ok: false, error: allowed.reason, skipped: true });
      return [{ channel: "sms" as const, ok: false, error: allowed.reason }];
    }
    const template = kind === "deposit" ? PREORDER_DEPOSIT_SMS : PREORDER_BALANCE_SMS;
    const values = { store: store.name, order_number: order.orderNumber, order_url: storeUrl(store, `/order/${order.id}`), paid: amounts.paid, balance: amounts.balance };
    const body = fillVariables(template, values as unknown as FlowVariables, "text").replace(/\s{2,}/g, " ").trim();
    const send = await textSender(store, { senderId: settings.smsSenderId });
    const outcome = await send.sms(phone, body).catch((error): SendOutcome => ({ ok: false, error: String(error) }));
    await finish(id, outcome);
    return [{ channel: "sms" as const, ok: outcome.ok }];
  } catch (error) {
    console.error(`[customer messages] preorder ${kind} for order ${orderId} failed`, error);
    return [];
  }
}
