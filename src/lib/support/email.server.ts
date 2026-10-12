import "server-only";

import { PORTAL_LABEL, SUPPORT_EMAIL, escapeHtml, formatTicketNumber, replyAddress, topicLabel, type SupportPortal } from "./pure";

// Support emails: the team's new-ticket alert, the customer's "we've got it" receipt and agent replies.
// Plain inline-styled HTML like the other transactional emails (src/lib/notifications/resend.ts).

/** Where new tickets are emailed and where replies come back: SUPPORT_INBOX, else support@shopinbos.com. */
export function supportInbox() {
  return process.env.SUPPORT_INBOX?.trim() || SUPPORT_EMAIL;
}

/** support+sb-1042@… so an emailed reply threads back into the ticket (see /api/support/inbound). */
export function replyAddressFor(number: number) {
  return replyAddress(supportInbox(), number);
}

function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px;color:#16141F;line-height:1.6;font-size:15px">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function frame(inner: string, footer: string) {
  return `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff">
    ${inner}
    <p style="color:#9C98A8;font-size:12px;line-height:1.5;margin-top:28px;border-top:1px solid #ECEAF2;padding-top:14px">${footer}</p>
  </div>`;
}

function button(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 22px;background:#16141F;color:#ffffff;text-decoration:none;border-radius:999px;margin:8px 0 4px;font-size:14px;font-weight:700">${escapeHtml(label)}</a>`;
}

export function newTicketEmail(input: { number: number | null; name: string; email: string | null; phone: string | null; topic: string; portal: string; subject: string; body: string; files: number; link: string | null }) {
  const ref = input.number ? formatTicketNumber(input.number) : "New request";
  const who = [input.email, input.phone].filter(Boolean).map((item) => escapeHtml(item as string)).join(" · ") || "no contact given";
  return frame(
    `<div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#B23E0A;margin-bottom:6px">${escapeHtml(ref)} · ${escapeHtml(topicLabel(input.topic))}</div>
    <h2 style="font-size:19px;margin:0 0 6px;color:#16141F">${escapeHtml(input.subject)}</h2>
    <p style="margin:0 0 16px;color:#6B6779;font-size:14px">${escapeHtml(input.name)} (${escapeHtml(PORTAL_LABEL[input.portal as SupportPortal] ?? input.portal)}) · ${who}</p>
    <div style="background:#F6F5F9;border-radius:14px;padding:14px 16px;margin-bottom:12px">${paragraphs(input.body)}</div>
    ${input.files ? `<p style="color:#6B6779;font-size:13px;margin:0 0 12px">${input.files} file${input.files === 1 ? "" : "s"} attached in the ticket.</p>` : ""}
    ${input.link ? button(input.link, "Open in the support desk") : `<p style="color:#6B6779;font-size:13px">Support tickets aren't switched on yet (run docs/migrations/2026-10-12-support.sql). Reply to this email to answer.</p>`}`,
    input.number ? "Reply from the support desk so the customer sees it in the app and by email." : "Sent from the Shopinbos \"Stuck?\" form.",
  );
}

export function receivedEmail(input: { name: string; number: number; body: string }) {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  return frame(
    `<h2 style="font-size:19px;margin:0 0 10px;color:#16141F">We've got it, ${escapeHtml(first)}.</h2>
    <p style="margin:0 0 16px;color:#16141F;line-height:1.6;font-size:15px">Your ticket is <b>${formatTicketNumber(input.number)}</b>. A real person from the Shopinbos team will reply, usually within an hour. Reply to this email to add anything.</p>
    <div style="background:#F6F5F9;border-radius:14px;padding:14px 16px;color:#6B6779">${paragraphs(input.body)}</div>`,
    "Shopinbos support · We reply in English or Pidgin.",
  );
}

export function agentReplyEmail(input: { name: string; number: number; body: string; agentName: string; link: string | null }) {
  const agent = input.agentName.trim().split(/\s+/)[0] || "The Shopinbos team";
  return frame(
    `<div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#6B6779;margin-bottom:10px">${formatTicketNumber(input.number)} · ${escapeHtml(agent)} from Shopinbos support</div>
    ${paragraphs(input.body)}
    ${input.link ? button(input.link, "Reply in Shopinbos") : ""}`,
    `Reply to this email to answer ${formatTicketNumber(input.number)}. Please keep the ticket number in the subject.`,
  );
}
