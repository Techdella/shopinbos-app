import "server-only";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/campaigns/render";
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

export function emailBodyHtml(body: string, storeName: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#16141F">${paragraphs}<p style="margin:18px 0 0;color:#6E6E68;font-size:13px">${escapeHtml(storeName)}</p></div>`;
}

export async function sendInboxEmail(input: SendInput & { replyTo?: string | null }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Email sending isn't set up on this server (RESEND_API_KEY)." };
  const address = inboxAddress(input.store.slug);
  const from = address ? `${input.store.name.replace(/["<>]/g, "")} <${address}>` : formatFromAddress(input.store.name);
  const subject = input.subject ? (/^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`) : `A reply from ${input.store.name}`;
  const { data, error } = await new Resend(apiKey).emails.send({
    from,
    to: [input.to],
    subject,
    text: input.body,
    html: emailBodyHtml(input.body, input.store.name),
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
