import "server-only";

import { buildPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { PORTAL_LABEL, SUPPORT_EMAIL, escapeHtml, formatTicketNumber, replyAddress, topicLabel, type SupportPortal } from "./pure";

// Support emails: the team's new-ticket alert, the customer's "we've got it" receipt and agent replies.
// Built on the shared email shell (src/lib/email/shell.ts): Shopinbos logo, light/dark, compliance footer.

/** Where new tickets are emailed and where replies come back: SUPPORT_INBOX, else support@shopinbos.com. */
export function supportInbox() {
  return process.env.SUPPORT_INBOX?.trim() || SUPPORT_EMAIL;
}

/** support+sb-1042@… so an emailed reply threads back into the ticket (see /api/support/inbound). */
export function replyAddressFor(number: number) {
  return replyAddress(supportInbox(), number);
}


export function newTicketEmail(input: { number: number | null; name: string; email: string | null; phone: string | null; topic: string; portal: string; subject: string; body: string; files: number; link: string | null }) {
  const ref = input.number ? formatTicketNumber(input.number) : "New request";
  const who = [input.email, input.phone].filter(Boolean).join(" · ") || "no contact given";
  return buildPlatformEmail({
    kind: "transactional",
    eyebrow: `${ref} · ${topicLabel(input.topic)}`,
    heading: input.subject,
    preheader: `${input.name}: ${input.body.slice(0, 120)}`,
    bodyHtml: `${html.small(`${input.name} (${PORTAL_LABEL[input.portal as SupportPortal] ?? input.portal}) · ${who}`)}${html.quote(html.text(input.body))}${input.files ? html.small(`${input.files} file${input.files === 1 ? "" : "s"} attached in the ticket.`) : ""}${input.link ? "" : html.small("Support tickets aren't switched on yet (run docs/migrations/2026-10-12-support.sql). Reply to this email to answer.")}`,
    cta: input.link ? { label: "Open in the support desk", url: input.link } : null,
    reason: "you're on the Shopinbos support rota",
    serviceNote: input.number ? "Reply from the support desk so the customer sees it in the app and by email." : "Sent from the Shopinbos \"Stuck?\" form.",
  }).html;
}

export function receivedEmail(input: { name: string; number: number; body: string }) {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  return buildPlatformEmail({
    kind: "transactional",
    eyebrow: `Ticket ${formatTicketNumber(input.number)}`,
    heading: `We've got it, ${first}.`,
    preheader: "A real person from the Shopinbos team will reply, usually within an hour.",
    bodyHtml: `${html.raw(`Your ticket is <b>${escapeHtml(formatTicketNumber(input.number))}</b>. A real person from the Shopinbos team will reply, usually within an hour. Reply to this email to add anything.`)}${html.quote(html.text(input.body))}`,
    reason: "you contacted Shopinbos support",
    serviceNote: "This is a service message about your support request. We reply in English or Pidgin.",
  }).html;
}

export function agentReplyEmail(input: { name: string; number: number; body: string; agentName: string; link: string | null }) {
  const agent = input.agentName.trim().split(/\s+/)[0] || "The Shopinbos team";
  return buildPlatformEmail({
    kind: "transactional",
    eyebrow: `${formatTicketNumber(input.number)} · ${agent} from Shopinbos support`,
    heading: "A reply from Shopinbos support",
    preheader: input.body.slice(0, 140),
    bodyHtml: html.text(input.body),
    cta: input.link ? { label: "Reply in Shopinbos", url: input.link } : null,
    reason: "you contacted Shopinbos support",
    serviceNote: `Reply to this email to answer ${formatTicketNumber(input.number)}. Please keep the ticket number in the subject.`,
  }).html;
}

/** The first email of a conversation the team started from Admin › Inbox › New conversation. */
export function newConversationEmail(input: { name: string; number: number; subject: string; body: string; agentName: string }) {
  const agent = input.agentName.trim().split(/\s+/)[0] || "The Shopinbos team";
  return buildPlatformEmail({
    kind: "transactional",
    eyebrow: `${formatTicketNumber(input.number)} · ${agent} from Shopinbos`,
    heading: input.subject,
    preheader: input.body.slice(0, 140),
    bodyHtml: html.text(input.body),
    reason: "the Shopinbos team is getting in touch with you",
    serviceNote: `Reply to this email and it reaches ${agent} and the Shopinbos team. Please keep ${formatTicketNumber(input.number)} in the subject.`,
  }).html;
}
