import { NextRequest, NextResponse } from "next/server";
import { fetchReceivedEmail } from "@/lib/inbox/channels/email";
import { normaliseInboundEmail, verifyHmacHex, verifySvixSignature, type InboundEmail } from "@/lib/inbox/pure";
import { addressedToSupport, stripQuotedReply, ticketNumberFromEmail } from "@/lib/support/pure";
import { supportInbox } from "@/lib/support/email.server";
import { ingestSupportEmail } from "@/lib/support/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Emails to the support inbox become tickets; replies thread into theirs. Same shape as /api/webhooks/email:
//  • Resend: add a second webhook for "email.received" pointing here, signed with SUPPORT_WEBHOOK_SECRET
//    (falls back to RESEND_WEBHOOK_SECRET). Receiving must be on for SUPPORT_INBOX's domain.
//  • Any other relay: POST JSON { from, to, subject, text, html, message_id } with X-Inbox-Signature = hex
//    HMAC-SHA256 of the body using SUPPORT_EMAIL_WEBHOOK_SECRET (falls back to INBOX_EMAIL_WEBHOOK_SECRET).
// Mail to other addresses is ignored, so this and the store inbox webhook can both receive every event.

async function ingest(email: InboundEmail) {
  if (!addressedToSupport(email.to, supportInbox())) return "not-support";
  const result = await ingestSupportEmail({
    fromEmail: email.fromEmail,
    fromName: email.fromName,
    subject: email.subject,
    text: email.text,
    body: stripQuotedReply(email.text),
    messageId: email.messageId,
    attachments: email.attachments.length,
    number: ticketNumberFromEmail(email),
  });
  return result;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const svix = { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") };

  if (svix.id) {
    const secret = process.env.SUPPORT_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET;
    if (!verifySvixSignature(svix, raw, secret)) return new NextResponse("Invalid signature", { status: 401 });
    const event = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> };
    if (event.type !== "email.received") return NextResponse.json({ received: true });
    const data = event.data ?? {};
    const full = typeof data.email_id === "string" ? await fetchReceivedEmail(data.email_id).catch(() => null) : null;
    const email = normaliseInboundEmail(full ?? data);
    if (!email) return NextResponse.json({ received: true, skipped: "unreadable" });
    return NextResponse.json({ received: true, result: await ingest(email) });
  }

  const secret = process.env.SUPPORT_EMAIL_WEBHOOK_SECRET || process.env.INBOX_EMAIL_WEBHOOK_SECRET;
  if (!verifyHmacHex(raw, req.headers.get("x-inbox-signature"), secret)) return new NextResponse("Invalid signature", { status: 401 });
  const email = normaliseInboundEmail(JSON.parse(raw));
  if (!email) return new NextResponse("Unreadable email", { status: 400 });
  return NextResponse.json({ received: true, result: await ingest(email) });
}
