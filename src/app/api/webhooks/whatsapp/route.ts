import { NextRequest, NextResponse } from "next/server";
import { findChannelByAccount, ingestInbound, markChannelError, updateMessageStatus } from "@/lib/inbox/service";
import { parseWhatsAppWebhook, parseWhatsAppWebhookErrors, verifyMetaSignature } from "@/lib/inbox/pure";
import { metaVerifyHandshake } from "@/lib/inbox/webhooks";
import { marketingInboundHook, marketingStatusHook } from "@/lib/marketing/webhook-hooks";
import { parseTemplateStatusUpdates } from "@/lib/marketing/text-channels";
import { applyTemplateStatusUpdates } from "@/lib/marketing/whatsapp-templates.server";
import { ingestSupportWhatsApp } from "@/lib/support/service.server";
import { inboxSignatureOk, isInboxWhatsAppNumber } from "@/lib/support/whatsapp.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WhatsApp Cloud API webhook. Callback URL: https://<app>/api/webhooks/whatsapp, fields "messages" and
// "message_template_status_update" (template approvals, so order messages start without a manual Sync).
// GET is Meta's verify handshake; POST is signed with X-Hub-Signature-256 (the app secret): the platform's
// META_APP_SECRET (Embedded Signup, or sellers on Shopinbos's app) or the seller's own app secret. Each phone
// number's messages and receipts are only processed when the signature checks out for that number's store.
// Messages to Shopinbos's own number (WHATSAPP_LEADS_PHONE_NUMBER_ID) go to the admin inbox instead.

export function GET(req: NextRequest) {
  return metaVerifyHandshake(req, ["whatsapp"]);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const { messages, statuses } = parseWhatsAppWebhook(payload);
  const errors = parseWhatsAppWebhookErrors(payload);
  const platformOk = verifyMetaSignature(raw, signature, process.env.META_APP_SECRET);
  let anyVerified = platformOk;

  const accounts = new Set([...messages.map((m) => m.accountId), ...statuses.map((s) => s.accountId ?? ""), ...errors.map((e) => e.accountId)].filter(Boolean));
  for (const accountId of accounts) {
    // Shopinbos's own number (lead messages, +1 711-695-1381): messages become admin inbox conversations.
    if (isInboxWhatsAppNumber(accountId)) {
      if (!inboxSignatureOk(raw, signature)) continue;
      anyVerified = true;
      for (const message of messages.filter((m) => m.accountId === accountId)) {
        await ingestSupportWhatsApp({ phone: message.contactPhone ?? message.threadId, name: message.contactName ?? null, text: message.text, messageId: message.externalId, attachments: message.attachments.map((a) => ({ mediaId: a.mediaId ?? null, name: a.name ?? null, contentType: a.contentType ?? null })) }).catch((error) =>
          console.error("[webhooks/whatsapp] inbox ingest failed", error),
        );
      }
      continue;
    }
    const channel = await findChannelByAccount("whatsapp", accountId);
    if (!channel) continue;
    if (!platformOk && !verifyMetaSignature(raw, signature, channel.credentials.appSecret)) continue;
    anyVerified = true;
    const storeId = channel.row.storeId;
    for (const message of messages.filter((m) => m.accountId === accountId)) {
      await ingestInbound({
        storeId,
        channel: "whatsapp",
        threadId: message.threadId,
        contact: { name: message.contactName, phone: message.contactPhone },
        message: { body: message.text, externalId: message.externalId, attachments: message.attachments, createdAt: message.timestamp, ...(message.replyId ? { meta: { replyId: message.replyId } } : {}) },
      }).catch(async (error) => {
        console.error("[webhooks/whatsapp] ingest failed", error);
        await markChannelError(channel.row.id, "A message couldn't be saved. We'll keep trying on the next one.");
      });
      // "STOP" / "Stop promotions" replies opt the number out of this shop's WhatsApp marketing.
      await marketingInboundHook({ storeId, channel: "whatsapp", phone: message.contactPhone, text: message.text });
    }
    // Delivery receipts only touch this store's messages, matched by Meta's message id.
    for (const status of statuses.filter((s) => s.accountId === accountId)) {
      await updateMessageStatus(status.externalId, status.status, status.error, storeId);
      await marketingStatusHook(status.externalId, status.status, status.error, storeId); // campaigns and order messages
    }
    const error = errors.find((e) => e.accountId === accountId);
    if (error) await markChannelError(channel.row.id, `WhatsApp reported a problem: ${error.message}`);
  }

  // Template approvals and rejections, for WhatsApp accounts connected through Shopinbos's app.
  const templateUpdates = platformOk ? parseTemplateStatusUpdates(payload) : [];
  if (templateUpdates.length) await applyTemplateStatusUpdates(templateUpdates).catch((error) => console.error("[webhooks/whatsapp] template status failed", error));

  if (!anyVerified && (messages.length || statuses.length)) return new NextResponse("Invalid signature", { status: 401 });
  return NextResponse.json({ received: true });
}
