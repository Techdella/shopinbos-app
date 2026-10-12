import "server-only";

import { db } from "@/lib/db/client";
import { getChannel } from "@/lib/inbox/service";
import { sendSmsReply } from "@/lib/inbox/channels/sms";
import { sendWhatsApp } from "@/lib/inbox/channels/whatsapp";
import { handleInboundOptOut } from "./opt-outs";
import type { TextChannel } from "./text-channels";

// What the SMS (/api/webhooks/sms/[provider]) and WhatsApp (/api/webhooks/whatsapp) webhooks call for marketing:
//   marketingInboundHook  — every customer message: STOP / START opt-outs, with a confirmation back;
//   marketingStatusHook   — every delivery receipt: per-recipient status on campaigns and order messages.
// Both never throw, so a webhook keeps answering 200.

export async function marketingInboundHook(input: { storeId: string; channel: TextChannel; phone: string | null | undefined; text: string | null | undefined }) {
  const outcome = await handleInboundOptOut(input);
  if (!outcome.handled || !input.phone) return outcome;
  try {
    const own = await getChannel(input.storeId, input.channel);
    const store = await db.store.findUnique({ where: { id: input.storeId }, select: { id: true, name: true, slug: true } });
    if (own && store) {
      // They just wrote to us, so a free-form WhatsApp reply is inside the 24-hour window.
      const send = input.channel === "sms" ? sendSmsReply : sendWhatsApp;
      const sent = await send({ to: input.phone, body: outcome.reply, store, credentials: own.credentials });
      if (!sent.ok) console.warn("[marketing] opt-out confirmation not sent:", sent.error);
    }
  } catch (error) {
    console.error("[marketing] opt-out confirmation failed", error);
  }
  return outcome;
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

/** Moves a campaign recipient or order message forward (never back: receipts can arrive out of order). */
export async function marketingStatusHook(externalId: string | null | undefined, status: string, error?: string | null, storeId?: string | null) {
  if (!externalId) return;
  try {
    const now = new Date();
    const where = { externalId, ...(storeId ? { storeId } : {}) };
    const recipient = await db.campaignRecipient.findFirst({ where, select: { id: true, status: true, campaignId: true, deliveredAt: true } });
    if (recipient) {
      if (status === "failed") {
        if (recipient.status !== "read" && recipient.status !== "delivered") {
          await db.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "failed", error: (error || "The provider couldn't deliver it.").slice(0, 300) } });
        }
      } else if ((RANK[status] ?? -1) > (RANK[recipient.status] ?? -1)) {
        const firstDelivery = !recipient.deliveredAt && (status === "delivered" || status === "read");
        await db.campaignRecipient.update({
          where: { id: recipient.id },
          data: { status, ...(firstDelivery ? { deliveredAt: now } : {}), ...(status === "read" ? { readAt: now } : {}) },
        });
        if (firstDelivery) await db.broadcastCampaign.update({ where: { id: recipient.campaignId }, data: { deliveredCount: { increment: 1 } } });
        // A WhatsApp read counts as an open in the campaign numbers.
        if (status === "read") {
          const opened = await db.campaignRecipient.updateMany({ where: { id: recipient.id, openedAt: null }, data: { openedAt: now } });
          if (opened.count) await db.broadcastCampaign.update({ where: { id: recipient.campaignId }, data: { openCount: { increment: 1 } } });
        }
      }
    }
    const message = await db.customerMessage.findFirst({ where, select: { id: true, status: true } });
    if (message) {
      if (status === "failed") {
        if (message.status !== "read" && message.status !== "delivered") await db.customerMessage.update({ where: { id: message.id }, data: { status: "failed", error: (error || "The provider couldn't deliver it.").slice(0, 300) } });
      } else if ((RANK[status] ?? -1) > (RANK[message.status] ?? -1)) {
        await db.customerMessage.update({ where: { id: message.id }, data: { status, ...(status === "delivered" || status === "read" ? { deliveredAt: now } : {}) } });
      }
    }
  } catch (hookError) {
    console.error("[marketing] status hook failed", hookError);
  }
}
