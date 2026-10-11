import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { fetchMetaProfile } from "@/lib/inbox/channels/meta";
import { findChannelByAccount, ingestInbound } from "@/lib/inbox/service";
import { parseMetaMessagingWebhook, verifyMetaSignature } from "@/lib/inbox/pure";
import { metaVerifyHandshake } from "@/lib/inbox/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Facebook Messenger (object "page") and Instagram DMs (object "instagram").
// Callback URL: https://<app>/api/webhooks/meta, fields "messages". Signed with X-Hub-Signature-256.

export function GET(req: NextRequest) {
  return metaVerifyHandshake(req, ["messenger", "instagram"]);
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

  const { channel, messages } = parseMetaMessagingWebhook(payload);
  const platformOk = verifyMetaSignature(raw, signature, process.env.META_APP_SECRET);
  let anyVerified = platformOk;

  for (const accountId of new Set(messages.map((m) => m.accountId))) {
    const connected = await findChannelByAccount(channel, accountId);
    if (!connected) continue;
    if (!platformOk && !verifyMetaSignature(raw, signature, connected.credentials.appSecret)) continue;
    anyVerified = true;
    for (const message of messages.filter((m) => m.accountId === accountId)) {
      const known = await db.inboxConversation.findUnique({
        where: { storeId_channel_externalThreadId: { storeId: connected.row.storeId, channel, externalThreadId: message.threadId } },
        select: { contactName: true },
      });
      const profile = known?.contactName ? { name: null, handle: null } : await fetchMetaProfile(message.threadId, connected.credentials.pageAccessToken ?? "", channel === "instagram");
      await ingestInbound({
        storeId: connected.row.storeId,
        channel,
        threadId: message.threadId,
        contact: { name: profile.name, handle: profile.handle },
        message: { body: message.text, externalId: message.externalId, attachments: message.attachments, createdAt: message.timestamp },
      }).catch((error) => console.error("[webhooks/meta] ingest failed", error));
    }
  }

  if (!anyVerified && messages.length) return new NextResponse("Invalid signature", { status: 401 });
  return NextResponse.json({ received: true });
}
