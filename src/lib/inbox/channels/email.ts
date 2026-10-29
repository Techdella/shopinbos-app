import "server-only";
import { Resend } from "resend";
import { appBase, loadStoreSender } from "@/lib/email/compliance.server";
import { inboxReplyEmail } from "@/lib/email/store-emails";
import { resolveEmailSender, replySecret } from "@/lib/email-channel/server";
import { sendGmailEmail } from "@/lib/email-channel/gmail.server";
import { encodeReplyAddress, formatFrom } from "@/lib/email-channel/pure";
import type { SendInput, SendResult } from "./types";

// Email out of the inbox: the seller's Gmail, their own domain through Resend, or the store's Shopinbos inbox
// address (only with INBOX_EMAIL_DOMAIN). Replies land back in the inbox through Resend inbound
// (POST /api/webhooks/email) or, for Gmail, the gmail-sync cron. A store with none of these can't email customers:
// we never send a seller's message from the platform's own address (RESEND_FROM_EMAIL).

export const EMAIL_NOT_SET_UP = "Set up your email first (Inbox → Email) so customers get your replies from your own address.";

export function inboxEmailDomain() {
  return process.env.INBOX_EMAIL_DOMAIN?.trim().toLowerCase() || null;
}

export function inboxAddress(slug: string) {
  const domain = inboxEmailDomain();
  return domain ? `${slug}@${domain}` : null;
}

/** The seller's reply in the store's email shell (logo, light/dark, footer with the store's business details). */
export async function emailBodyHtml(body: string, store: { id: string; name: string }) {
  const sender = (await loadStoreSender(store.id).catch(() => null)) ?? { name: store.name };
  return inboxReplyEmail({ appUrl: appBase(), store: sender, body });
}

/**
 * Sends one inbox email the way the store has connected email (src/lib/email-channel):
 *  • Gmail: through the Gmail API as the seller's Gmail, in the same Gmail thread (replies come back by gmail-sync).
 *  • Own domain (verified in Resend): from "<From name> <hello@mystore.com>".
 *  • Shopinbos inbox: from "<Store> <slug@INBOX_EMAIL_DOMAIN>".
 *  • Nothing connected: not sent (EMAIL_NOT_SET_UP), never from the platform's address.
 * With INBOX_EMAIL_DOMAIN, Reply-To is the store's inbox address with the conversation in it (slug+r-<id>-<sig>@…),
 * so the customer's answer lands back in this conversation through the inbound webhook; without it, a domain
 * sender's replies go to its own address.
 * `exactSubject`: the seller is starting a new email thread, so the subject goes out as is (not "Re: …").
 */
export async function sendInboxEmail(input: SendInput & { exactSubject?: boolean; conversationId?: string | null }): Promise<SendResult> {
  const subject = input.subject ? (input.exactSubject || /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`) : `A reply from ${input.store.name}`;
  const sender = await resolveEmailSender(input.store.id, input.store.name);
  if (sender.kind === "none") return { ok: false, error: EMAIL_NOT_SET_UP };
  const html = await emailBodyHtml(input.body, input.store);
  if (sender.kind === "gmail") {
    return sendGmailEmail({ storeId: input.store.id, conversationId: input.conversationId, fromName: sender.fromName, fromAddress: sender.address, to: input.to, subject, text: input.body, html });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Email sending isn't set up on this server (RESEND_API_KEY)." };
  const address = inboxAddress(input.store.slug);
  const domain = inboxEmailDomain();
  const threaded = domain && input.conversationId ? encodeReplyAddress(input.store.slug, input.conversationId, domain, replySecret()) : address;
  let from: string;
  if (sender.kind === "domain") from = formatFrom(sender.fromName, sender.address);
  else if (address) from = formatFrom(input.store.name, address);
  else return { ok: false, error: EMAIL_NOT_SET_UP };
  const replyTo = threaded ?? (sender.kind === "domain" ? sender.address : undefined);
  const { data, error } = await new Resend(apiKey).emails.send({
    from,
    to: [input.to],
    subject,
    text: input.body,
    html,
    replyTo,
    headers: input.externalId && !input.externalId.startsWith("gmail:") ? { "In-Reply-To": input.externalId, References: input.externalId } : undefined,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, externalId: data?.id ?? null };
}

/** Fetches a received email's body from Resend (the webhook only carries the envelope). */
export async function fetchReceivedEmail(emailId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const { data } = await new Resend(apiKey).emails.receiving.get(emailId);
  return data ?? null;
}
