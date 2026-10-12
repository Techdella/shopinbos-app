import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { fetchReceivedEmail, inboxEmailDomain } from "@/lib/inbox/channels/email";
import { ingestInbound, updateMessageStatus } from "@/lib/inbox/service";
import { inboundDedupeId, normaliseHexSignature, normaliseInboundEmail, storeSlugFromAddress, verifyInboundEmailSignature, verifySvixSignature, type InboundEmail } from "@/lib/inbox/pure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound email and email delivery events.
//  • Resend (recommended): a webhook for "email.received" (and optionally delivered/bounced) pointing here, signed
//    with Svix headers and RESEND_WEBHOOK_SECRET. Mail to <store-slug>@INBOX_EMAIL_DOMAIN lands in that store's inbox.
//    Timestamps more than 5 minutes off are refused.
//  • Any other relay (Cloudflare Email Worker, Postmark, Mailgun route): POST JSON { from, to, subject, text, html,
//    message_id } with X-Inbox-Timestamp = unix seconds and X-Inbox-Signature = hex HMAC-SHA256 of
//    "<timestamp>.<body>" using INBOX_EMAIL_WEBHOOK_SECRET. Timestamps more than 5 minutes off are refused.
// Replays inside the window are dropped by message id (ingestInbound skips a known externalId): a quiet 200.

const EVENT_STATUS: Record<string, string> = { "email.sent": "sent", "email.delivered": "delivered", "email.opened": "read", "email.bounced": "failed", "email.failed": "failed", "email.complained": "failed" };

async function ingestEmail(email: InboundEmail) {
  const slug = storeSlugFromAddress(email.to, inboxEmailDomain());
  if (!slug) return "no-store";
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return "no-store";
  const channel = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "email" } }, select: { status: true } });
  if (channel?.status !== "connected") return "not-connected";
  await ingestInbound({
    storeId: store.id,
    channel: "email",
    threadId: email.fromEmail,
    subject: email.subject || null,
    contact: { name: email.fromName, email: email.fromEmail },
    message: { body: email.text || "(empty email)", bodyHtml: email.html, externalId: email.messageId, attachments: email.attachments },
  });
  return "ok";
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const svix = { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") };

  if (svix.id) {
    if (!verifySvixSignature(svix, raw, process.env.RESEND_WEBHOOK_SECRET)) return new NextResponse("Invalid signature", { status: 401 });
    const event = (parseJson(raw) ?? {}) as { type?: string; data?: Record<string, unknown> };
    const data = event.data ?? {};
    if (event.type === "email.received") {
      const full = typeof data.email_id === "string" ? await fetchReceivedEmail(data.email_id) : null;
      const email = normaliseInboundEmail(full ?? data);
      if (!email) return NextResponse.json({ received: true, skipped: "unreadable" });
      email.messageId = inboundDedupeId(email.messageId, svix.id, "svix");
      return NextResponse.json({ received: true, result: await ingestEmail(email) });
    }
    const status = EVENT_STATUS[event.type ?? ""];
    if (status && typeof data.email_id === "string") {
      const bounce = data.bounce as { message?: string } | undefined;
      await updateMessageStatus(data.email_id, status, bounce?.message ?? (status === "failed" ? "The email bounced." : null));
    }
    return NextResponse.json({ received: true });
  }

  const signature = req.headers.get("x-inbox-signature");
  if (!verifyInboundEmailSignature({ signature, timestamp: req.headers.get("x-inbox-timestamp") }, raw, process.env.INBOX_EMAIL_WEBHOOK_SECRET)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const email = normaliseInboundEmail(parseJson(raw));
  if (!email) return new NextResponse("Unreadable email", { status: 400 });
  email.messageId = inboundDedupeId(email.messageId, normaliseHexSignature(signature), "relay");
  return NextResponse.json({ received: true, result: await ingestEmail(email) });
}
