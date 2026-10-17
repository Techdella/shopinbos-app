import "server-only";

import { appBase, platformLegal } from "@/lib/email/compliance.server";
import { html, listUnsubscribeHeaders, platformEmail } from "@/lib/email/shell";
import { sendWhatsAppMessage, sendWhatsAppTemplate } from "@/lib/notifications/service";
import { sendEmail, type BatchEmail } from "@/lib/notifications/resend";
import { sendPlatformSms } from "@/lib/sms";
import {
  firstName,
  leadAddress,
  personalise,
  signupLink,
  textOptOutLine,
  withUtm,
  campaignSlug,
  type LeadForMessage,
  type LeadMessageContentType,
} from "./pure";
import { optOutUrl } from "./tokens";
import { whatsappTemplate } from "./whatsapp-content";
import { metaWhatsAppConfig, sendMetaTemplate, sendMetaText } from "./whatsapp-meta.server";

// One message to one lead, on email, SMS or WhatsApp, from Shopinbos's own accounts (Resend, the platform SMS
// providers, the platform WhatsApp provider). Every message carries a way to opt out of that channel.

export type SendOutcome = { status: "sent"; to: string; providerId?: string | null } | { status: "failed" | "skipped"; to: string; error: string };

/** What the message is for: a campaign or automation name, used for the UTM tags on its links. */
export type SendContext = { name: string };

const FAKE_LEAD_ID = "test";

function links(lead: Pick<LeadForMessage, "id">, content: LeadMessageContentType, context: SendContext) {
  const app = appBase();
  const signup = signupLink(app, { channel: content.channel, campaign: context.name });
  const cta = content.ctaUrl ? withUtm(content.ctaUrl, { source: "shopinbos_leads", medium: content.channel, campaign: campaignSlug(context.name) }) : signup;
  const optOut = lead.id === FAKE_LEAD_ID ? `${app}/api/public/leads/opt-out` : optOutUrl(app, lead.id, content.channel);
  return { signup, cta, optOut };
}

/** The email (subject, html, headers) for one lead. Lifecycle kind: unsubscribe link + List-Unsubscribe headers. */
export function leadEmail(lead: LeadForMessage, content: LeadMessageContentType, context: SendContext, to: string): BatchEmail {
  const { signup, cta, optOut } = links(lead, content, context);
  const subject = personalise(content.subject ?? "", { name: lead.name, signupLink: signup });
  const body = personalise(content.body, { name: lead.name, signupLink: signup });
  const document = platformEmail({
    appUrl: appBase(),
    kind: "lifecycle",
    heading: subject,
    preheader: body.split("\n")[0]?.slice(0, 120) ?? null,
    bodyHtml: html.text(body),
    cta: { label: content.ctaLabel || "Create your free store", url: cta },
    reason: "you left your details on shopinbos.com",
    legal: platformLegal(),
    unsubscribeUrl: optOut,
    preferencesUrl: optOut,
  });
  return { to, subject, html: document, headers: lead.id === FAKE_LEAD_ID ? undefined : listUnsubscribeHeaders(optOut) };
}

/** The SMS / WhatsApp text for one lead, ending with the opt-out link. */
export function leadText(lead: LeadForMessage, content: LeadMessageContentType, context: SendContext) {
  const { signup, optOut } = links(lead, content, context);
  const body = personalise(content.body, { name: lead.name, signupLink: signup }).trim();
  return `${body}\n\n${textOptOutLine(content.channel === "sms" ? "sms" : "whatsapp", optOut)}`;
}

export async function sendToLead(lead: LeadForMessage, content: LeadMessageContentType, context: SendContext): Promise<SendOutcome> {
  const to = leadAddress(lead, content.channel);
  if (!to) return { status: "skipped", to: "", error: lead.optedOut.includes(content.channel) ? "Opted out of this channel" : `No ${content.channel === "email" ? "email address" : "phone number"}` };
  try {
    if (content.channel === "email") {
      const email = leadEmail(lead, content, context, to);
      const result = await sendEmail({ to: [to], subject: email.subject, html: email.html, headers: email.headers });
      return result.success ? { status: "sent", to, providerId: result.id ?? null } : { status: "failed", to, error: result.message ?? "Email refused" };
    }
    if (content.channel === "sms") {
      const result = await sendPlatformSms({ to: [to], body: leadText(lead, content, context) });
      return result.ok ? { status: "sent", to, providerId: result.externalId ?? null } : { status: "failed", to, error: result.error };
    }
    // WhatsApp: a message to someone who hasn't written to us in the last 24 hours must be an approved template.
    // Our own number on Meta's Cloud API when it's set up (Admin › Leads › WhatsApp), else the platform provider.
    const meta = metaWhatsAppConfig();
    if (meta) {
      const first = firstName(lead.name) || "there";
      // The launch templates (whatsapp-content.ts) take the first name and the opt-out link; any other approved
      // template takes the first name as its only variable.
      const params = whatsappTemplate(content.waTemplate) ? [first, links(lead, content, context).optOut] : [first];
      const sent = content.waTemplate
        ? await sendMetaTemplate(meta, { to, template: content.waTemplate, language: content.waLanguage ?? "en", params })
        : await sendMetaText(meta, { to, text: leadText(lead, content, context) });
      return sent.ok ? { status: "sent", to, providerId: sent.id } : { status: "failed", to, error: sent.error };
    }
    // Templates get the first name as their first variable ({{1}}).
    const result = content.waTemplate
      ? await sendWhatsAppTemplate({ to: [to], templateName: content.waTemplate, language: content.waLanguage ?? "en", parameters: { "1": firstName(lead.name) || "there", first_name: firstName(lead.name) || "there" } })
      : await sendWhatsAppMessage({ to: [to], message: leadText(lead, content, context) });
    return result.success ? { status: "sent", to } : { status: "failed", to, error: result.message || "WhatsApp refused" };
  } catch (error) {
    return { status: "failed", to, error: error instanceof Error ? error.message : String(error) };
  }
}

/** A test message to an admin's own email or phone, filled in as if for a lead called `name`. */
export function sendTestMessage(content: LeadMessageContentType, context: SendContext, to: string, name: string | null) {
  const lead: LeadForMessage = { id: FAKE_LEAD_ID, name, kind: "test", optedOut: [], email: content.channel === "email" ? to : null, phone: content.channel === "email" ? null : to };
  return sendToLead(lead, content, context);
}

