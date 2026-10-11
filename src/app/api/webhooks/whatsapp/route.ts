import { NextRequest, NextResponse } from "next/server";
import { findChannelByAccount, ingestInbound, markChannelError, updateMessageStatus } from "@/lib/inbox/service";
import { parseWhatsAppWebhook, verifyMetaSignature } from "@/lib/inbox/pure";
import { metaVerifyHandshake } from "@/lib/inbox/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WhatsApp Cloud API webhook. Callback URL: https://<app>/api/webhooks/whatsapp, field "messages".
// GET is Meta's verify handshake; POST is signed with X-Hub-Signature-256 (the app secret).

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
  const platformOk = verifyMetaSignature(raw, signature, process.env.META_APP_SECRET);
  let anyVerified = platformOk;

  const accounts = new Set([...messages.map((m) => m.accountId), ...statuses.map((s) => s.accountId ?? "")].filter(Boolean));
  for (const accountId of accounts) {
    const channel = await findChannelByAccount("whatsapp", accountId);
    if (!channel) continue;
    if (!platformOk && !verifyMetaSignature(raw, signature, channel.credentials.appSecret)) continue;
    anyVerified = true;
    for (const message of messages.filter((m) => m.accountId === accountId)) {
      await ingestInbound({
        storeId: channel.row.storeId,
        channel: "whatsapp",
        threadId: message.threadId,
        contact: { name: message.contactName, phone: message.contactPhone },
        message: { body: message.text, externalId: message.externalId, attachments: message.attachments, createdAt: message.timestamp },
      }).catch(async (error) => {
        console.error("[webhooks/whatsapp] ingest failed", error);
        await markChannelError(channel.row.id, "A message couldn't be saved. We'll keep trying on the next one.");
      });
    }
  }

  // Delivery receipts only touch messages we sent, matched by Meta's message id.
  if (statuses.length && anyVerified) {
    for (const status of statuses) await updateMessageStatus(status.externalId, status.status, status.error);
  }

  if (!anyVerified && (messages.length || statuses.length)) return new NextResponse("Invalid signature", { status: 401 });
  return NextResponse.json({ received: true });
}
