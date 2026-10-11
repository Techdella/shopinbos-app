import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { ingestInbound } from "@/lib/inbox/service";
import { parseTelegramUpdate, verifyTelegramSecret } from "@/lib/inbox/pure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram bot updates. Connecting the bot calls setWebhook with this URL and a secret token, which Telegram
// sends back in X-Telegram-Bot-Api-Secret-Token.

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const channel = await db.inboxChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.channel !== "telegram" || channel.status !== "connected") return new NextResponse("Not found", { status: 404 });
  if (!verifyTelegramSecret(req.headers.get("x-telegram-bot-api-secret-token"), channel.webhookSecret)) {
    return new NextResponse("Invalid secret", { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const message = parseTelegramUpdate(update);
  // Anything that isn't a new message (edits, joins) is acknowledged so Telegram doesn't retry it.
  if (!message) return NextResponse.json({ ok: true });

  await ingestInbound({
    storeId: channel.storeId,
    channel: "telegram",
    threadId: message.threadId,
    contact: { name: message.contactName, handle: message.contactHandle, phone: message.contactPhone },
    message: { body: message.text, externalId: message.externalId, attachments: message.attachments, createdAt: message.timestamp },
  });
  return NextResponse.json({ ok: true });
}
