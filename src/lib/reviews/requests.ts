import "server-only";
import { db } from "@/lib/db/client";
import { escapeHtml } from "@/lib/campaigns/render";
import { formatFromAddress, isEmailConfigured, sendEmail } from "@/lib/notifications/resend";
import { sendSms, sendWhatsAppMessage } from "@/lib/notifications/service";
import { toE164 } from "@shared/phone";
import { getChannel } from "@/lib/inbox/service";
import { sendSmsReply } from "@/lib/inbox/channels/sms";
import { platformSmsReady } from "@/lib/sms";
import { sendWhatsApp } from "@/lib/inbox/channels/whatsapp";
import { ordersDueForRequest, reviewRequestMessage, signReviewToken, type RequestChannel } from "./pure";
import { reviewLinkSecret } from "./secrets";
import { getReviewSettings, reviewUrls } from "./server";

// Asking buyers for reviews. Each request gets a signed link to /s/[slug]/review/<token> where the buyer
// reviews every item in the order. Email goes through Resend; SMS through the platform's SMS account
// (SMS_PROVIDER: Termii / Africa's Talking / Sendchamp, with failover) and WhatsApp through SendChamp. "link" sends nothing: the seller gets a wa.me link to send the
// message from their own WhatsApp. Used by the Reviews screen, Peggy, the reviews cron and marketing
// automations (agent A's post-purchase flow can call requestReviews with trigger "automation").
// When the store connected its own WhatsApp Cloud API number or SMS account in the inbox (agent E), requests
// go out from that first; the platform accounts are the fallback.

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

const REQUESTABLE = new Set(["paid", "processing", "packed", "shipped", "delivered"]);

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

function emailHtml(input: { storeName: string; customerName: string; link: string; items: string[] }) {
  const first = escapeHtml(input.customerName.trim().split(/\s+/)[0] || "there");
  const items = input.items.slice(0, 6).map((name) => `<li style="margin:0 0 4px">${escapeHtml(name)}</li>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#F6F4FA;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16141F">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="background:#fff;border:1px solid #E6E1F0;border-radius:22px;padding:28px">
<h1 style="margin:0 0 12px;font-size:22px">How was your order, ${first}?</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.55">Thank you for shopping with ${escapeHtml(input.storeName)}. A quick rating helps other buyers and helps us get better.</p>
${items ? `<ul style="margin:0 0 18px;padding-left:18px;font-size:14px;color:#4A4658">${items}</ul>` : ""}
<a href="${escapeHtml(input.link)}" style="display:inline-block;background:#16141F;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;font-size:15px">Leave a review</a>
<p style="margin:18px 0 0;font-size:12.5px;color:#6B6878">It takes about a minute. You can add photos too.</p>
</div></div></body></html>`;
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

/** Sends (or prepares) review requests for orders in one store. Never sends twice for the same order and channel unless `resend`. */
export async function requestReviews(input: { storeId: string; orderIds: string[]; channel: RequestChannel; trigger?: RequestTrigger; resend?: boolean }) {
  const secret = reviewLinkSecret();
  const store = await db.store.findUnique({ where: { id: input.storeId }, select: { id: true, name: true, slug: true } });
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
        const sent = await sendEmail({
          to: [email!],
          subject: message.subject,
          html: emailHtml({ storeName: store.name, customerName: order.buyerName, link, items: orderItemNames(order.items) }),
          from: formatFromAddress(store.name),
        });
        ok = sent.success;
        error = sent.message ?? "";
      } else if (input.channel === "sms") {
        if (own.sms) {
          const sent = await sendSmsReply({ to: phone!, body: message.sms, store: ref, credentials: own.sms.credentials });
          ok = sent.ok;
          error = sent.ok ? "" : sent.error;
        } else {
          const sent = await sendSms({ to: [phone!], message: message.sms });
          ok = sent.success;
          error = sent.message;
        }
      } else if (own.whatsapp) {
        const sent = await sendWhatsApp({ to: phone!, body: message.text, store: ref, credentials: own.whatsapp.credentials });
        ok = sent.ok;
        error = sent.ok ? "" : sent.error;
      } else {
        const sent = await sendWhatsAppMessage({ to: [phone!], message: message.text });
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
