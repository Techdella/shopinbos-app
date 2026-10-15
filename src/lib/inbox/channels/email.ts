import "server-only";
import { Resend } from "resend";
import { appBase, loadStoreSender } from "@/lib/email/compliance.server";
import { inboxReplyEmail } from "@/lib/email/store-emails";
import { formatFromAddress } from "@/lib/notifications/resend";
import type { SendInput, SendResult } from "./types";

// Email through Resend. Outbound goes from "<Store> <slug@INBOX_EMAIL_DOMAIN>" so the customer's reply lands
// back in the inbox through Resend inbound (POST /api/webhooks/email). Without INBOX_EMAIL_DOMAIN we still send
// (from RESEND_FROM_EMAIL), but replies go to the seller's own mailbox instead of the inbox.

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

/** `exactSubject`: the seller is starting a new email thread, so the subject goes out as is (not "Re: …"). */
export async function sendInboxEmail(input: SendInput & { replyTo?: string | null; exactSubject?: boolean }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Email sending isn't set up on this server (RESEND_API_KEY)." };
  const address = inboxAddress(input.store.slug);
  const from = address ? `${input.store.name.replace(/["<>]/g, "")} <${address}>` : formatFromAddress(input.store.name);
  const subject = input.subject ? (input.exactSubject || /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`) : `A reply from ${input.store.name}`;
  const { data, error } = await new Resend(apiKey).emails.send({
    from,
    to: [input.to],
    subject,
    text: input.body,
    html: await emailBodyHtml(input.body, input.store),
    replyTo: address ?? input.replyTo ?? undefined,
    headers: input.externalId ? { "In-Reply-To": input.externalId, References: input.externalId } : undefined,
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
