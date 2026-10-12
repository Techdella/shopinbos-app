import { NextRequest, NextResponse } from "next/server";
import { fetchReceivedEmail } from "@/lib/inbox/channels/email";
import { inboundDedupeId, normaliseHexSignature, normaliseInboundEmail, verifyInboundEmailSignature, verifySvixSignature, type InboundEmail } from "@/lib/inbox/pure";
import { addressedToSupport, stripQuotedReply, ticketNumberFromEmail } from "@/lib/support/pure";
import { supportInbox } from "@/lib/support/email.server";
import { ingestSupportEmail } from "@/lib/support/service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Emails to the support inbox become tickets; replies thread into theirs. Same shape as /api/webhooks/email:
//  • Resend: add a second webhook for "email.received" pointing here, signed with SUPPORT_WEBHOOK_SECRET
//    (falls back to RESEND_WEBHOOK_SECRET). Receiving must be on for SUPPORT_INBOX's domain. Svix headers;
//    timestamps more than 5 minutes off are refused.
//  • Any other relay: POST JSON { from, to, subject, text, html, message_id } with X-Inbox-Timestamp = unix seconds
//    and X-Inbox-Signature = hex HMAC-SHA256 of "<timestamp>.<body>" using SUPPORT_EMAIL_WEBHOOK_SECRET (falls back
//    to INBOX_EMAIL_WEBHOOK_SECRET). Timestamps more than 5 minutes off are refused.
// Replays inside the window are dropped by message id (SupportMessage.externalId is unique): a quiet 200.
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
    const secret = process.env.SUPPORT_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET;
    if (!verifySvixSignature(svix, raw, secret)) return new NextResponse("Invalid signature", { status: 401 });
    const event = parseJson(raw) as { type?: string; data?: Record<string, unknown> } | null;
    if (!event || event.type !== "email.received") return NextResponse.json({ received: true });
    const data = event.data ?? {};
    const full = typeof data.email_id === "string" ? await fetchReceivedEmail(data.email_id).catch(() => null) : null;
    const email = normaliseInboundEmail(full ?? data);
    if (!email) return NextResponse.json({ received: true, skipped: "unreadable" });
    email.messageId = inboundDedupeId(email.messageId, svix.id, "svix");
    return NextResponse.json({ received: true, result: await ingest(email) });
  }

  const secret = process.env.SUPPORT_EMAIL_WEBHOOK_SECRET || process.env.INBOX_EMAIL_WEBHOOK_SECRET;
  const signature = req.headers.get("x-inbox-signature");
  if (!verifyInboundEmailSignature({ signature, timestamp: req.headers.get("x-inbox-timestamp") }, raw, secret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const email = normaliseInboundEmail(parseJson(raw));
  if (!email) return new NextResponse("Unreadable email", { status: 400 });
  email.messageId = inboundDedupeId(email.messageId, normaliseHexSignature(signature), "relay");
  return NextResponse.json({ received: true, result: await ingest(email) });
}
