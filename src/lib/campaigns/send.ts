import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { formatFromAddress, isEmailConfigured, sendEmailBatch } from "@/lib/notifications/resend";
import { extractCampaignLinks, renderCampaignEmail } from "./render";

export type RecipientFilter =
  | { mode: "all" }
  | { mode: "subscribers" }
  | { mode: "min_orders"; value: number }
  | { mode: "min_spend"; value: number }
  | { mode: "specific"; emails: string[] };

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
    default:
      return { mode: "all" };
  }
}

/** Unique, valid recipient emails for a filter, minus anyone who unsubscribed, bounced or complained. */
export async function resolveCampaignRecipients(storeId: string, filter: RecipientFilter) {
  const recipients = new Map<string, { email: string; name: string | null }>();
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

export async function sendCampaign(storeId: string, campaignId: string): Promise<SendCampaignResult> {
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email sending isn't set up yet. Add RESEND_API_KEY to the app environment." };
  }

  // Claim the campaign so a double click or an overlapping scheduler run can't send it twice.
  const claimed = await db.broadcastCampaign.updateMany({
    where: { id: campaignId, storeId, status: { in: ["draft", "scheduled"] } },
    data: { status: "sending" },
  });
  const campaign = await db.broadcastCampaign.findFirst({
    where: { id: campaignId, storeId },
    include: { store: { select: { name: true } } },
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
      return { ok: false, error: "Add email content before sending" };
    }

    const recipients = await resolveCampaignRecipients(storeId, parseRecipientFilter(campaign.recipientFilter));
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
    let batchError: string | null = null;

    for (;;) {
      const batch = await db.campaignRecipient.findMany({ where: { campaignId, status: "queued" }, take: BATCH_SIZE, orderBy: { createdAt: "asc" } });
      if (batch.length === 0) break;

      const result = await sendEmailBatch(
        batch.map((recipient) => {
          const rendered = renderCampaignEmail({
            html: campaign.bodyHtml,
            recipientName: recipient.name,
            storeName: campaign.store.name,
            token: recipient.token,
            appUrl: appUrl(),
          });
          return {
            to: recipient.email,
            subject,
            html: rendered.html,
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
