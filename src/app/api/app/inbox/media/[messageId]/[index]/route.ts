import { NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { GRAPH_URL } from "@/lib/inbox/channels/types";
import { sellerStore } from "@/lib/inbox/auth";
import { getChannel } from "@/lib/inbox/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Attachments that need the store's credentials to download (WhatsApp media, Telegram files) are streamed
// through here, so tokens never reach the browser. Africa's Talking voicemail recordings are plain HTTPS links.

type Attachment = { type?: string; url?: string | null; mediaId?: string | null; contentType?: string | null; name?: string | null };

// Files come from customers, so only plain images, audio and video open inline; anything else (HTML, SVG, PDF…)
// downloads, and the response is sandboxed so it can never run script on the app's origin.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|heic|heif)|audio\/[\w.+-]+|video\/[\w.+-]+)$/i;

async function stream(res: Response | null, fallbackType?: string | null, name?: string | null) {
  if (!res || !res.ok || !res.body) return apiError("NOT_FOUND", "The provider no longer has this file.", 404);
  const type = (res.headers.get("content-type") ?? fallbackType ?? "application/octet-stream").split(";")[0].trim();
  const inline = INLINE_TYPES.test(type);
  const filename = (name || "attachment").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export const GET = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const message = await db.inboxMessage.findFirst({ where: { id: String(params.messageId), storeId: store.id }, include: { conversation: { select: { channel: true } } } });
  const attachment = (Array.isArray(message?.attachments) ? (message!.attachments as Attachment[]) : [])[Number(params.index)];
  if (!message || !attachment) return apiError("NOT_FOUND", "Attachment not found", 404);
  const channel = message.conversation.channel;
  const timeout = AbortSignal.timeout(20_000);

  if (channel === "whatsapp" && attachment.mediaId) {
    const wa = await getChannel(store.id, "whatsapp");
    if (!wa) return apiError("NOT_CONNECTED", "Reconnect WhatsApp to open this file.", 409);
    const headers = { Authorization: `Bearer ${wa.credentials.accessToken}` };
    const meta = await fetch(`${GRAPH_URL}/${encodeURIComponent(attachment.mediaId)}`, { headers, signal: timeout }).then((r) => r.json()).catch(() => null);
    if (!meta?.url) return apiError("NOT_FOUND", "WhatsApp no longer has this file (media expires after 30 days).", 404);
    return stream(await fetch(meta.url, { headers, signal: timeout }).catch(() => null), attachment.contentType, attachment.name);
  }

  if (channel === "telegram" && attachment.mediaId) {
    const tg = await getChannel(store.id, "telegram");
    if (!tg) return apiError("NOT_CONNECTED", "Reconnect Telegram to open this file.", 409);
    const file = await fetch(`https://api.telegram.org/bot${tg.credentials.botToken}/getFile?file_id=${encodeURIComponent(attachment.mediaId)}`, { signal: timeout }).then((r) => r.json()).catch(() => null);
    if (!file?.result?.file_path) return apiError("NOT_FOUND", "Telegram no longer has this file.", 404);
    return stream(await fetch(`https://api.telegram.org/file/bot${tg.credentials.botToken}/${file.result.file_path}`, { signal: timeout }).catch(() => null), attachment.contentType, attachment.name);
  }

  // Recordings and media from the old SMS/calls provider need keys that are no longer stored.
  if ((channel === "sms" || channel === "voice") && attachment.url?.startsWith("https://api.twilio.com/")) {
    return apiError("NOT_FOUND", "This file came through your previous phone provider and can't be opened any more.", 404);
  }

  if (attachment.url?.startsWith("https://")) return NextResponse.redirect(attachment.url);
  return apiError("NOT_FOUND", "This file can't be opened here.", 404);
});
