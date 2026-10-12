import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { formatFromAddress, isEmailConfigured, sendEmailBatch } from "@/lib/notifications/resend";
import { MARKETING_STORE_SELECT, emailBrand, storeUrl } from "@/lib/marketing/brand";
import { channelStatus, sendMarketingText } from "@/lib/marketing/channels";
import { contactsInSegment, segmentRules } from "@/lib/marketing/contacts";
import { wrapEmail } from "@/lib/marketing/email-layout";
import { fillVariables, firstName } from "@/lib/marketing/flows";
import { extractCampaignLinks, renderCampaignEmail } from "./render";

export type RecipientFilter =
  | { mode: "all" }
  | { mode: "subscribers" }
  | { mode: "min_orders"; value: number }
  | { mode: "min_spend"; value: number }
  | { mode: "specific"; emails: string[] }
  | { mode: "segment"; segmentId: string };

export type CampaignChannel = "email" | "sms" | "whatsapp";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BATCH_SIZE = 100;
const ATTRIBUTION_PARAM = "sib_c";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://app.shopinbos.com";
}

export function parseRecipientFilter(raw: unknown): RecipientFilter {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { mode: "all" };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { mode: "all" };
  const filter = value as Record<string, unknown>;
  switch (filter.mode) {
    case "subscribers":
      return { mode: "subscribers" };
    case "min_orders":
    case "min_spend":
      return { mode: filter.mode, value: Number(filter.value) || 0 };
    case "specific":
      return { mode: "specific", emails: Array.isArray(filter.emails) ? filter.emails.map(String) : [] };
    case "segment":
      return typeof filter.segmentId === "string" && filter.segmentId ? { mode: "segment", segmentId: filter.segmentId } : { mode: "all" };
    default:
      return { mode: "all" };
  }
}

/** Unique, valid recipient emails for a filter, minus anyone who unsubscribed, bounced or complained. */
export async function resolveCampaignRecipients(storeId: string, filter: RecipientFilter) {
  const recipients = new Map<string, { email: string; name: string | null }>();
  if (filter.mode === "segment") {
    // Saved segment: everyone it matches with an email. A segment with no rules matches nobody here.
    const rules = await segmentRules(storeId, filter.segmentId);
    if (rules?.conditions.length) {
      for (const contact of await contactsInSegment(storeId, rules)) {
        if (contact.email && EMAIL_PATTERN.test(contact.email) && !recipients.has(contact.email)) recipients.set(contact.email, { email: contact.email, name: contact.name });
      }
    }
    const suppressedRows = await db.subscriber.findMany({ where: { storeId, status: { not: "active" } }, select: { email: true } });
    for (const { email } of suppressedRows) recipients.delete(email.trim().toLowerCase());
    return Array.from(recipients.values());
  }
  const add = (email: string, name: string | null) => {
    const normalized = email.trim().toLowerCase();
    if (EMAIL_PATTERN.test(normalized) && !recipients.has(normalized)) recipients.set(normalized, { email: normalized, name });
  };

  if (filter.mode === "all" || filter.mode === "subscribers") {
    const subscribers = await db.subscriber.findMany({ where: { storeId, status: "active" }, select: { email: true, name: true } });
    for (const subscriber of subscribers) add(subscriber.email, subscriber.name);
  }

  if (filter.mode !== "subscribers") {
    const orders = await db.retailOrder.findMany({ where: { storeId }, select: { buyerEmail: true, buyerName: true, total: true, status: true } });
    const paid = new Set<string>(PAID_ORDER_STATUSES);
    const buyers = new Map<string, { name: string; orders: number; spend: number }>();
    for (const order of orders) {
      const key = order.buyerEmail.trim().toLowerCase();
      const buyer = buyers.get(key) ?? { name: order.buyerName, orders: 0, spend: 0 };
      if (paid.has(order.status)) {
        buyer.orders += 1;
        buyer.spend += Number(order.total || 0);
      }
      buyers.set(key, buyer);
    }

    if (filter.mode === "specific") {
      for (const email of filter.emails) add(email, buyers.get(email.trim().toLowerCase())?.name ?? null);
    } else {
      for (const [email, buyer] of buyers) {
        if (filter.mode === "min_orders" && buyer.orders < filter.value) continue;
        if (filter.mode === "min_spend" && buyer.spend < filter.value) continue;
        add(email, buyer.name);
      }
    }
  }

  const suppressed = await db.subscriber.findMany({ where: { storeId, status: { not: "active" } }, select: { email: true } });
  for (const { email } of suppressed) recipients.delete(email.trim().toLowerCase());

  return Array.from(recipients.values());
}

export type SendCampaignResult = { ok: true; sent: number; failed: number } | { ok: false; error: string };

/** The audience a campaign goes to: its saved segment if it has one, else its recipient filter. */
export function campaignFilter(campaign: { segmentId: string | null; recipientFilter: unknown }): RecipientFilter {
  return campaign.segmentId ? { mode: "segment", segmentId: campaign.segmentId } : parseRecipientFilter(campaign.recipientFilter);
}

export async function sendCampaign(storeId: string, campaignId: string): Promise<SendCampaignResult> {
  const head = await db.broadcastCampaign.findFirst({ where: { id: campaignId, storeId }, select: { channel: true } });
  if (!head) return { ok: false, error: "Campaign not found" };
  const channel = (head.channel || "email") as CampaignChannel;
  if (channel === "email" && !isEmailConfigured()) {
    return { ok: false, error: "Email sending isn't set up yet. Add RESEND_API_KEY to the app environment." };
  }
  if (channel !== "email") {
    const status = (await channelStatus(storeId))[channel];
    if (!status.ready) return { ok: false, error: `${channel === "sms" ? "SMS" : "WhatsApp"} isn't set up yet. ${status.howTo}` };
  }

  // Claim the campaign so a double click or an overlapping scheduler run can't send it twice.
  const claimed = await db.broadcastCampaign.updateMany({
    where: { id: campaignId, storeId, status: { in: ["draft", "scheduled"] } },
    data: { status: "sending" },
  });
  const campaign = await db.broadcastCampaign.findFirst({
    where: { id: campaignId, storeId },
    include: { store: { select: MARKETING_STORE_SELECT } },
  });
  if (!campaign) return { ok: false, error: "Campaign not found" };
  if (claimed.count === 0) {
    return { ok: false, error: campaign.status === "sent" ? "This campaign has already been sent" : "This campaign is already sending" };
  }

  const restoreStatus = async () =>
    db.broadcastCampaign.update({ where: { id: campaignId }, data: { status: campaign.scheduledAt ? "scheduled" : "draft" } });

  try {
    if (!campaign.bodyHtml.trim()) {
      await restoreStatus();
      return { ok: false, error: channel === "email" ? "Add email content before sending" : "Write the message before sending" };
    }
    if (channel !== "email") return await sendTextCampaign(campaign, channel, restoreStatus);

    // {{store_url}} is the same for every recipient: resolve it once and save it, so click tracking
    // (which only follows links in the saved body) recognises the shop link.
    let bodyHtml = campaign.bodyHtml;
    if (/{{\s*store_url\s*}}/.test(bodyHtml)) {
      bodyHtml = bodyHtml.replace(/{{\s*store_url\s*}}/g, storeUrl(campaign.store));
      await db.broadcastCampaign.update({ where: { id: campaignId }, data: { bodyHtml } });
    }

    const recipients = await resolveCampaignRecipients(storeId, campaignFilter(campaign));
    if (recipients.length === 0) {
      await restoreStatus();
      return { ok: false, error: "No recipients match this audience" };
    }

    await db.campaignRecipient.createMany({
      data: recipients.map((recipient) => ({
        campaignId,
        storeId,
        email: recipient.email,
        name: recipient.name,
        token: randomBytes(16).toString("base64url"),
      })),
      skipDuplicates: true,
    });
    // Retry anything that failed in an earlier attempt.
    await db.campaignRecipient.updateMany({ where: { campaignId, status: "failed" }, data: { status: "queued", error: null } });

    const from = formatFromAddress(campaign.senderName ?? campaign.store.name);
    const subject = campaign.subject.replace(/{{\s*store\s*}}/g, campaign.store.name);
    const brand = emailBrand(campaign.store);
    let batchError: string | null = null;

    for (;;) {
      const batch = await db.campaignRecipient.findMany({ where: { campaignId, status: "queued" }, take: BATCH_SIZE, orderBy: { createdAt: "asc" } });
      if (batch.length === 0) break;

      const result = await sendEmailBatch(
        batch.map((recipient) => {
          const rendered = renderCampaignEmail({
            html: bodyHtml,
            recipientName: recipient.name,
            storeName: campaign.store.name,
            token: recipient.token,
            appUrl: appUrl(),
          });
          return {
            to: recipient.email,
            subject: subject.replace(/{{\s*name\s*}}/g, firstName(recipient.name) || "there"),
            html: wrapEmail({ bodyHtml: rendered.html, brand, preheader: campaign.preheader?.replace(/{{\s*store\s*}}/g, campaign.store.name).replace(/{{\s*name\s*}}/g, firstName(recipient.name) || "there") ?? null }),
            from,
            replyTo: campaign.replyTo ?? undefined,
            headers: {
              "List-Unsubscribe": `<${rendered.oneClickUnsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          };
        }),
      );

      const ids = batch.map((recipient) => recipient.id);
      if (result.success) {
        await db.campaignRecipient.updateMany({ where: { id: { in: ids } }, data: { status: "sent", sentAt: new Date() } });
      } else {
        batchError = result.message ?? "Email provider rejected the batch";
        await db.campaignRecipient.updateMany({ where: { id: { in: ids } }, data: { status: "failed", error: batchError } });
        break; // A rejected batch is usually systemic (domain, quota); stop rather than burn through the list.
      }
    }

    const [sent, failed] = await Promise.all([
      db.campaignRecipient.count({ where: { campaignId, status: "sent" } }),
      db.campaignRecipient.count({ where: { campaignId, status: { in: ["failed", "queued"] } } }),
    ]);

    if (sent === 0) {
      await restoreStatus();
      return { ok: false, error: batchError ?? "No emails were sent" };
    }

    await db.broadcastCampaign.update({
      where: { id: campaignId },
      data: { status: "sent", sentAt: campaign.sentAt ?? new Date(), sentCount: sent, deliveredCount: sent },
    });
    return { ok: true, sent, failed };
  } catch (error) {
    await restoreStatus().catch(() => null);
    throw error;
  }
}

type ClaimedCampaign = {
  id: string;
  storeId: string;
  segmentId: string | null;
  recipientFilter: unknown;
  bodyHtml: string;
  sentAt: Date | null;
  store: { id: string; name: string; slug: string; customDomain: string | null };
};

/** Phone numbers a text campaign reaches: the segment (or everyone) with a phone and SMS/WhatsApp permission. */
export async function resolveTextRecipients(storeId: string, filter: RecipientFilter, channel: "sms" | "whatsapp") {
  let contacts: Awaited<ReturnType<typeof contactsInSegment>>;
  if (filter.mode === "segment") {
    const rules = await segmentRules(storeId, filter.segmentId);
    contacts = rules?.conditions.length ? await contactsInSegment(storeId, rules) : [];
  } else {
    contacts = await contactsInSegment(storeId, { match: "all", conditions: [] });
    if (filter.mode === "subscribers") contacts = contacts.filter((c) => c.status === "active");
    if (filter.mode === "min_orders") contacts = contacts.filter((c) => c.orders >= filter.value);
    if (filter.mode === "min_spend") contacts = contacts.filter((c) => c.spent >= filter.value);
    if (filter.mode === "specific") contacts = [];
  }
  const seen = new Set<string>();
  const out: Array<{ phone: string; name: string | null }> = [];
  for (const contact of contacts) {
    if (!contact.phone || seen.has(contact.phone)) continue;
    if (!(channel === "sms" ? contact.smsOk : contact.whatsappOk)) continue;
    seen.add(contact.phone);
    out.push({ phone: contact.phone, name: contact.name });
  }
  return out;
}

const TEXT_CONCURRENCY = 5;

/** SMS / WhatsApp campaigns: one personalised message per phone, each recipient's outcome recorded. */
async function sendTextCampaign(campaign: ClaimedCampaign, channel: "sms" | "whatsapp", restoreStatus: () => Promise<unknown>): Promise<SendCampaignResult> {
  const recipients = await resolveTextRecipients(campaign.storeId, campaignFilter(campaign), channel);
  if (recipients.length === 0) {
    await restoreStatus();
    return { ok: false, error: `Nobody in this audience has a phone number and ${channel === "sms" ? "SMS" : "WhatsApp"} permission` };
  }
  // The phone number goes in the recipient's address column (named email for historical reasons).
  await db.campaignRecipient.createMany({
    data: recipients.map((recipient) => ({ campaignId: campaign.id, storeId: campaign.storeId, email: recipient.phone, name: recipient.name, token: randomBytes(16).toString("base64url") })),
    skipDuplicates: true,
  });
  await db.campaignRecipient.updateMany({ where: { campaignId: campaign.id, status: "failed" }, data: { status: "queued", error: null } });

  const shopLink = storeUrl(campaign.store);
  const queue = await db.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: "queued" }, orderBy: { createdAt: "asc" } });
  let consecutiveFailures = 0;
  for (let i = 0; i < queue.length; i += TEXT_CONCURRENCY) {
    const slice = queue.slice(i, i + TEXT_CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (recipient) => {
        const body = fillVariables(campaign.bodyHtml, { name: firstName(recipient.name) || "there", full_name: recipient.name ?? "", store: campaign.store.name, store_url: shopLink });
        const result = await sendMarketingText(campaign.store, channel, recipient.email, body).catch((error) => ({ ok: false as const, error: String(error) }));
        await db.campaignRecipient.update({
          where: { id: recipient.id },
          data: result.ok ? { status: "sent", sentAt: new Date(), error: null } : { status: "failed", error: result.error.slice(0, 300) },
        });
        return result.ok;
      }),
    );
    consecutiveFailures = results.every((ok) => !ok) ? consecutiveFailures + slice.length : 0;
    if (consecutiveFailures >= 15) break; // The provider is refusing everything (credit, sender id); stop.
  }

  const [sent, failed] = await Promise.all([
    db.campaignRecipient.count({ where: { campaignId: campaign.id, status: "sent" } }),
    db.campaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ["failed", "queued"] } } }),
  ]);
  if (sent === 0) {
    await restoreStatus();
    const firstError = await db.campaignRecipient.findFirst({ where: { campaignId: campaign.id, status: "failed" }, select: { error: true } });
    return { ok: false, error: firstError?.error ?? "No messages were sent" };
  }
  await db.broadcastCampaign.update({ where: { id: campaign.id }, data: { status: "sent", sentAt: campaign.sentAt ?? new Date(), sentCount: sent, deliveredCount: sent } });
  return { ok: true, sent, failed };
}

/** Sends every scheduled campaign whose time has come. Used by the cron route. */
export async function sendDueCampaigns(now = new Date()) {
  const due = await db.broadcastCampaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    select: { id: true, storeId: true },
    take: 20,
  });
  const results = [];
  for (const campaign of due) {
    results.push({ id: campaign.id, result: await sendCampaign(campaign.storeId, campaign.id).catch((error) => ({ ok: false as const, error: String(error) })) });
  }
  return results;
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

export async function recordCampaignOpen(token: string) {
  const first = await db.campaignRecipient.updateMany({ where: { token, openedAt: null }, data: { openedAt: new Date() } });
  if (first.count === 0) return;
  const recipient = await db.campaignRecipient.findUnique({ where: { token }, select: { campaignId: true, storeId: true, email: true } });
  if (!recipient) return;
  await Promise.all([
    db.broadcastCampaign.update({ where: { id: recipient.campaignId }, data: { openCount: { increment: 1 } } }),
    db.subscriber.updateMany({ where: { storeId: recipient.storeId, email: recipient.email }, data: { lastOpenedAt: new Date() } }),
  ]);
}

/** Returns the destination with the attribution token attached, or null when the link isn't part of the campaign. */
export async function recordCampaignClick(token: string, url: string): Promise<string | null> {
  const recipient = await db.campaignRecipient.findUnique({
    where: { token },
    select: { campaignId: true, storeId: true, email: true, campaign: { select: { bodyHtml: true } } },
  });
  // Only redirect to links that appear in the campaign body, so tracking URLs can't be used as an open redirect.
  if (!recipient || !extractCampaignLinks(recipient.campaign.bodyHtml).includes(url)) return null;

  const now = new Date();
  const firstClick = await db.campaignRecipient.updateMany({ where: { token, clickedAt: null }, data: { clickedAt: now } });
  // Image blocking hides opens; a click proves the email was opened.
  const firstOpen = await db.campaignRecipient.updateMany({ where: { token, openedAt: null }, data: { openedAt: now } });
  if (firstClick.count || firstOpen.count) {
    await db.broadcastCampaign.update({
      where: { id: recipient.campaignId },
      data: { clickCount: { increment: firstClick.count }, openCount: { increment: firstOpen.count } },
    });
  }
  if (firstClick.count) {
    await db.subscriber.updateMany({ where: { storeId: recipient.storeId, email: recipient.email }, data: { lastClickedAt: now } });
  }

  const destination = new URL(url);
  destination.searchParams.set(ATTRIBUTION_PARAM, token);
  return destination.toString();
}

/** Unsubscribes the recipient from the store's marketing. Returns the store name, or null for an unknown token. */
export async function unsubscribeCampaignRecipient(token: string): Promise<string | null> {
  const recipient = await db.campaignRecipient.findUnique({
    where: { token },
    select: { campaignId: true, storeId: true, email: true, name: true, campaign: { select: { store: { select: { name: true } } } } },
  });
  if (!recipient) return null;

  const existing = await db.subscriber.findUnique({
    where: { storeId_email: { storeId: recipient.storeId, email: recipient.email } },
    select: { status: true },
  });
  const now = new Date();
  await db.subscriber.upsert({
    where: { storeId_email: { storeId: recipient.storeId, email: recipient.email } },
    update: { status: "unsubscribed", unsubscribedAt: now },
    create: { storeId: recipient.storeId, email: recipient.email, name: recipient.name, source: "order", status: "unsubscribed", unsubscribedAt: now },
  });
  if (!existing || existing.status === "active") {
    await db.broadcastCampaign.update({ where: { id: recipient.campaignId }, data: { unsubscribeCount: { increment: 1 } } });
  }
  return recipient.campaign.store.name;
}

// ─── Conversion attribution ───────────────────────────────────────────────────

/** Returns the token if it belongs to a recipient of this store's campaigns, so it can be stored on the order. */
export async function validCampaignToken(storeId: string, token: string | undefined | null) {
  if (!token || token.length > 64) return null;
  const recipient = await db.campaignRecipient.findFirst({ where: { token, storeId }, select: { token: true } });
  return recipient?.token ?? null;
}

/** Credits a paid order to the campaign email that brought the buyer. Safe to call more than once. */
export async function creditCampaignConversion(orderId: string) {
  const order = await db.retailOrder.findUnique({
    where: { id: orderId },
    select: { id: true, storeId: true, total: true, status: true, campaignToken: true },
  });
  if (!order?.campaignToken || !(PAID_ORDER_STATUSES as readonly string[]).includes(order.status)) return;

  const credited = await db.campaignRecipient.updateMany({
    where: { token: order.campaignToken, storeId: order.storeId, convertedAt: null },
    data: { convertedAt: new Date(), orderId: order.id, revenue: Number(order.total) },
  });
  if (credited.count === 0) return;

  const recipient = await db.campaignRecipient.findUnique({ where: { token: order.campaignToken }, select: { campaignId: true } });
  if (!recipient) return;
  await db.broadcastCampaign.update({
    where: { id: recipient.campaignId },
    data: { conversionCount: { increment: 1 }, revenueGenerated: { increment: Number(order.total) } },
  });
}
