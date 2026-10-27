import "server-only";
import { db } from "@/lib/db/client";
import { appBase, contactLinks, storeSender, SENDER_STORE_SELECT, unsubscribeHeaders } from "@/lib/email/compliance.server";
import { contactAllows } from "@/lib/email/preferences";
import { loadOptOuts } from "@/lib/marketing/opt-outs";
import { isOptedOut } from "@/lib/marketing/text-channels";
import { normalizePhone } from "@/lib/marketing/segment-rules";
import { reviewRequestEmail } from "@/lib/email/store-emails";
import { formatFromAddress, isEmailConfigured, sendEmail } from "@/lib/notifications/resend";
import { sendSms, sendWhatsAppMessage } from "@/lib/notifications/service";
import { toE164 } from "@shared/phone";
import { getChannel } from "@/lib/inbox/service";
import { sendSmsReply } from "@/lib/inbox/channels/sms";
import { platformSmsReady } from "@/lib/sms";
import { sendWhatsApp } from "@/lib/inbox/channels/whatsapp";
import { ordersDueForRequest, reviewRequestMessage, signReviewToken, withOptOut, type RequestChannel } from "./pure";
import { reviewLinkSecret } from "./secrets";
import { getReviewSettings, reviewUrls } from "./server";

// Asking buyers for reviews. Each request gets a signed link to /s/[slug]/review/<token> where the buyer
// reviews every item in the order. Email goes through Resend; SMS through the platform's SMS account
// (SMS_PROVIDER: Termii / Africa's Talking / Sendchamp, with failover) and WhatsApp through SendChamp. "link" sends nothing: the seller gets a wa.me link to send the
// message from their own WhatsApp. Used by the Reviews screen, Peggy, the reviews cron and marketing
// automations (agent A's post-purchase flow can call requestReviews with trigger "automation").
// When the store connected its own WhatsApp Cloud API number or SMS account in the inbox (agent E), requests
// go out from that first; the platform accounts are the fallback.
// A review request asks for something, so it respects the buyer's choices like marketing does: no email to someone
// who unsubscribed from the shop (and every email carries an unsubscribe link), no SMS or WhatsApp to a number that
// replied STOP, and every SMS says how to stop.

export type RequestTrigger = "manual" | "auto" | "peggy" | "automation";

export interface RequestOutcome {
  orderId: string;
  orderNumber: string;
  customerName: string;
  status: "sent" | "failed" | "skipped" | "link";
  reason?: string;
  link?: string;
  /** For channel "link": opens WhatsApp with the message ready to send from the seller's phone. */
  whatsappUrl?: string;
}

const REQUESTABLE_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;
const REQUESTABLE = new Set<string>(REQUESTABLE_STATUSES);

export function channelReadiness() {
  const sms = platformSmsReady();
  return {
    email: isEmailConfigured(),
    sms,
    // The platform WhatsApp send goes through SendChamp only (Africa's Talking has no WhatsApp text here).
    whatsapp: Boolean(process.env.SENDCHAMP_API_KEY),
    link: true,
    links: Boolean(reviewLinkSecret()),
  };
}

async function storeChannels(storeId: string) {
  const [whatsapp, sms] = await Promise.all([getChannel(storeId, "whatsapp").catch(() => null), getChannel(storeId, "sms").catch(() => null)]);
  return { whatsapp, sms };
}

/** Platform readiness plus the store's own connected WhatsApp / SMS numbers. */
export async function storeChannelReadiness(storeId: string) {
  const platform = channelReadiness();
  const own = await storeChannels(storeId);
  return { ...platform, sms: platform.sms || Boolean(own.sms), whatsapp: platform.whatsapp || Boolean(own.whatsapp), ownSms: Boolean(own.sms), ownWhatsapp: Boolean(own.whatsapp) };
}

function orderItemNames(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (item && typeof item === "object" ? String((item as Record<string, unknown>).name ?? (item as Record<string, unknown>).productName ?? "") : ""))
    .filter(Boolean);
}

export function whatsappLink(phone: string | null, text: string) {
  const e164 = phone ? toE164(phone) : null;
  return `https://wa.me/${e164 ? e164.replace(/^\+/, "") : ""}?text=${encodeURIComponent(text)}`;
}

/**
 * "Ask for reviews now": paid-or-later orders from the last 120 days (delivered first), each with when and how the
 * buyer was last asked and whether they already reviewed, plus the store's recent requests. Used by the web
 * page (/home/reviews/request) and the app (/api/app/reviews/requests).
 */
export async function requestableOrders(storeId: string, take = 300) {
  const since = new Date(Date.now() - 120 * 86_400_000);
  const [orders, requests] = await Promise.all([
    db.retailOrder.findMany({
      where: { storeId, status: { in: [...REQUESTABLE_STATUSES] }, createdAt: { gte: since } },
      orderBy: [{ deliveredAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take,
      select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, buyerPhone: true, status: true, createdAt: true, deliveredAt: true },
    }),
    db.reviewRequest.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 500 }).catch(() => []),
  ]);
  const reviewedRows = orders.length
    ? await db.$queryRawUnsafe<Array<{ orderId: string }>>(`SELECT DISTINCT "orderId" FROM "ProductReview" WHERE "storeId" = $1 AND "orderId" = ANY($2)`, storeId, orders.map((o) => o.id)).catch(() => [])
    : [];
  const reviewed = new Set(reviewedRows.map((row) => row.orderId));
  const lastAsked = new Map<string, (typeof requests)[number]>();
  for (const request of requests) if (!lastAsked.has(request.orderId) && request.status !== "failed") lastAsked.set(request.orderId, request);
  return {
    orders: orders.map((order) => {
      const asked = lastAsked.get(order.id);
      return { ...order, asked: asked ? { channel: asked.channel, at: asked.createdAt } : null, reviewed: reviewed.has(order.id) };
    }),
    requests,
  };
}

/** Sends (or prepares) review requests for orders in one store. Never sends twice for the same order and channel unless `resend`. */
export async function requestReviews(input: { storeId: string; orderIds: string[]; channel: RequestChannel; trigger?: RequestTrigger; resend?: boolean }) {
  const secret = reviewLinkSecret();
  const store = await db.store.findUnique({ where: { id: input.storeId }, select: SENDER_STORE_SELECT });
  if (!store) throw new Error("Store not found");
  if (!secret) throw new Error("Review links need REVIEW_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY) to be set.");
  const ready = await storeChannelReadiness(store.id);
  const own = await storeChannels(store.id);
  const ref = { id: store.id, name: store.name, slug: store.slug };
  const orderIds = [...new Set(input.orderIds)].slice(0, 200);
  const [orders, earlier] = await Promise.all([
    db.retailOrder.findMany({
      where: { storeId: store.id, id: { in: orderIds } },
      select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, buyerPhone: true, status: true, items: true },
    }),
    db.reviewRequest.findMany({ where: { storeId: store.id, orderId: { in: orderIds }, channel: input.channel, status: { in: ["sent", "opened", "completed"] } }, select: { orderId: true } }),
  ]);
  const asked = new Set(earlier.map((row) => row.orderId));
  const urls = reviewUrls(store.slug);
  const optOuts = input.channel === "sms" || input.channel === "whatsapp" ? await loadOptOuts(store.id) : null;
  // Both spellings: contacts keep the address as typed, orders may differ in case.
  const emails = input.channel === "email" ? orders.flatMap((order) => (order.buyerEmail?.includes("@") ? [order.buyerEmail.trim(), order.buyerEmail.trim().toLowerCase()] : [])) : [];
  const contacts = emails.length
    ? new Map((await db.subscriber.findMany({ where: { storeId: store.id, email: { in: [...new Set(emails)] } }, select: { email: true, status: true, metadata: true } }).catch(() => [])).map((row) => [row.email.toLowerCase(), row]))
    : new Map<string, { status: string; metadata: unknown }>();
  const results: RequestOutcome[] = [];

  for (const order of orders) {
    const base = { orderId: order.id, orderNumber: order.orderNumber, customerName: order.buyerName };
    if (!REQUESTABLE.has(order.status)) {
      results.push({ ...base, status: "skipped", reason: "Order isn't paid or delivered" });
      continue;
    }
    if (asked.has(order.id) && !input.resend) {
      results.push({ ...base, status: "skipped", reason: "Already asked on this channel" });
      continue;
    }
    const email = order.buyerEmail?.includes("@") ? order.buyerEmail : null;
    const phone = order.buyerPhone ? toE164(order.buyerPhone) : null;
    if (input.channel === "email" && !email) {
      results.push({ ...base, status: "skipped", reason: "No email on this order" });
      continue;
    }
    if ((input.channel === "sms" || input.channel === "whatsapp") && !phone) {
      results.push({ ...base, status: "skipped", reason: "No phone number on this order" });
      continue;
    }
    if (input.channel === "email" && !contactAllows(contacts.get(email!.toLowerCase()), null)) {
      results.push({ ...base, status: "skipped", reason: "Unsubscribed from this shop's emails" });
      continue;
    }
    const normalized = phone ? normalizePhone(phone) : null;
    if ((input.channel === "sms" || input.channel === "whatsapp") && optOuts && normalized && isOptedOut(optOuts, input.channel, normalized, "marketing")) {
      results.push({ ...base, status: "skipped", reason: `Opted out of ${input.channel === "sms" ? "SMS" : "WhatsApp"} from this shop` });
      continue;
    }
    if (input.channel !== "link" && !ready[input.channel]) {
      results.push({ ...base, status: "skipped", reason: `${input.channel === "email" ? "Email" : input.channel === "sms" ? "SMS" : "WhatsApp"} sending isn't set up` });
      continue;
    }

    const request = await db.reviewRequest.create({
      data: { storeId: store.id, orderId: order.id, customerName: order.buyerName, email, phone, channel: input.channel, trigger: input.trigger ?? "manual" },
    });
    const link = urls.reviewLink(signReviewToken(request.id, secret));
    const message = reviewRequestMessage({ storeName: store.name, customerName: order.buyerName, link });

    if (input.channel === "link") {
      await db.reviewRequest.update({ where: { id: request.id }, data: { status: "sent", sentAt: new Date() } });
      results.push({ ...base, status: "link", link, whatsappUrl: whatsappLink(order.buyerPhone, message.text) });
      continue;
    }

    let ok = false;
    let error = "";
    try {
      if (input.channel === "email") {
        const links = contactLinks(store.id, email!);
        const sent = await sendEmail({
          to: [email!],
          subject: message.subject,
          html: reviewRequestEmail({ appUrl: appBase(), store: storeSender(store), customerName: order.buyerName, link, items: orderItemNames(order.items), unsubscribeUrl: links?.unsubscribe, preferencesUrl: links?.preferences }),
          headers: links ? unsubscribeHeaders(links) : undefined,
          from: formatFromAddress(store.name),
        });
        ok = sent.success;
        error = sent.message ?? "";
      } else if (input.channel === "sms") {
        if (own.sms) {
          const sent = await sendSmsReply({ to: phone!, body: withOptOut(message.sms, { reply: true }), store: ref, credentials: own.sms.credentials });
          ok = sent.ok;
          error = sent.ok ? "" : sent.error;
        } else {
          const sent = await sendSms({ to: [phone!], message: withOptOut(message.sms, { link: `${link}/stop` }) });
          ok = sent.success;
          error = sent.message;
        }
      } else if (own.whatsapp) {
        const sent = await sendWhatsApp({ to: phone!, body: withOptOut(message.text, { reply: true }, 1000), store: ref, credentials: own.whatsapp.credentials });
        ok = sent.ok;
        error = sent.ok ? "" : sent.error;
      } else {
        const sent = await sendWhatsAppMessage({ to: [phone!], message: withOptOut(message.text, { link: `${link}/stop` }, 1000) });
        ok = sent.success;
        error = sent.message;
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Send failed";
    }
    await db.reviewRequest.update({
      where: { id: request.id },
      data: ok ? { status: "sent", sentAt: new Date(), error: null } : { status: "failed", error: error.slice(0, 300) || "Send failed" },
    });
    results.push({ ...base, status: ok ? "sent" : "failed", link, ...(ok ? {} : { reason: error.slice(0, 200) || "Send failed" }) });
  }

  for (const id of orderIds) {
    if (!orders.some((order) => order.id === id)) results.push({ orderId: id, orderNumber: "", customerName: "", status: "skipped", reason: "Order not found in this store" });
  }

  return {
    results,
    sent: results.filter((r) => r.status === "sent" || r.status === "link").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };
}

/** Automatic requests after delivery for every store that turned them on. Called by /api/cron/reviews. */
export async function runAutoReviewRequests(now = new Date()) {
  const stores = await db.reviewSettings.findMany({ where: { autoRequest: true }, select: { storeId: true } }).catch(() => []);
  const summary: Array<{ storeId: string; sent: number; failed: number; skipped: number }> = [];
  for (const { storeId } of stores) {
    const settings = await getReviewSettings(storeId);
    const since = new Date(now.getTime() - 31 * 86_400_000);
    const orders = await db.retailOrder.findMany({
      where: { storeId, status: "delivered", OR: [{ deliveredAt: { gte: since } }, { deliveredAt: null, updatedAt: { gte: since } }] },
      select: { id: true, status: true, deliveredAt: true, updatedAt: true },
      take: 500,
    });
    if (!orders.length) continue;
    // Any earlier request (any channel, any trigger) counts: buyers are asked once.
    const earlier = await db.reviewRequest.findMany({ where: { storeId, orderId: { in: orders.map((o) => o.id) } }, select: { orderId: true } });
    const due = ordersDueForRequest(orders, new Set(earlier.map((row) => row.orderId)), settings.requestDelayDays, now);
    if (!due.length) continue;
    try {
      const result = await requestReviews({ storeId, orderIds: due.slice(0, 100).map((o) => o.id), channel: settings.requestChannel, trigger: "auto" });
      summary.push({ storeId, sent: result.sent, failed: result.failed, skipped: result.skipped });
    } catch (error) {
      console.error("[reviews] auto requests failed", storeId, error);
    }
  }
  return summary;
}
