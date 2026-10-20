// Lead growth (Admin › Lead campaigns): who a campaign or automation reaches, what each message says and the
// sign-up link with its UTM tags. Pure and browser-safe (the editors use it); signed opt-out links are in ./tokens.ts.
import { z } from "zod";
import { EMAIL_COLORS, escapeHtml, html, safeHref } from "../email/shell.ts";

export const LEAD_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export const CHANNEL_LABELS: Record<LeadChannel, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

/** Who a lead wants to be on Shopinbos (the website waitlist's "as"); every other form is a seller. */
export const LEAD_ROLES = ["seller", "supplier", "delivery"] as const;
export type LeadRole = (typeof LEAD_ROLES)[number];

export const ROLE_LABELS: Record<LeadRole, string> = { seller: "Sellers", supplier: "Suppliers", delivery: "Delivery partners" };

export function leadRoleFrom(value: unknown): LeadRole {
  return value === "supplier" || value === "delivery" ? value : "seller";
}

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
};

/** Who a campaign or automation reaches. Leads who signed up, were closed or opted out of the channel never get it. */
export const LeadAudience = z.object({
  /** Seller, supplier and/or delivery-partner leads. Empty = everyone. */
  roles: z.array(z.enum(LEAD_ROLES)).max(3).default([]),
  /** Form kinds (src/lib/website-leads/pure.ts LEAD_KINDS). Empty = every form. */
  kinds: z.array(z.string().max(40)).max(30).default([]),
  /** Lead statuses to include: "new" and/or "contacted". */
  statuses: z.array(z.enum(["new", "contacted"])).max(2).default(["new", "contacted"]),
  /** Only people who ticked "agree to messages" on the form. */
  consentOnly: z.boolean().default(true),
  /** Only leads from the last N days (0 = any time). */
  sinceDays: z.number().int().min(0).max(3650).default(0),
  /** Only leads whose source contains this text (a page, a campaign, "instagram"). */
  source: z.string().trim().max(120).default(""),
});
export type LeadAudienceType = z.infer<typeof LeadAudience>;

export function readAudience(value: unknown): LeadAudienceType {
  const parsed = LeadAudience.safeParse(value && typeof value === "object" ? value : {});
  return parsed.success ? parsed.data : LeadAudience.parse({});
}

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const MessageFields = z.object({
  channel: z.enum(LEAD_CHANNELS),
  subject: optionalText(160),
  body: z.string().trim().min(1, "Write the message.").max(5000),
  ctaLabel: optionalText(60),
  ctaUrl: z.string().trim().url("The button link must be a full https:// address.").max(500).optional().nullable().or(z.literal("")).transform((v) => v || null),
  waTemplate: z.string().trim().regex(/^[a-z0-9_]*$/, "WhatsApp template names are lower case letters, numbers and _.").max(120).optional().nullable().transform((v) => v || null),
  waLanguage: optionalText(12),
  /** A banner shown under the email's heading (1200×628, e.g. /brand/launch/…). WhatsApp templates carry their own. */
  imageUrl: z.string().trim().url("The image must be a full https:// address.").max(500).optional().nullable().or(z.literal("")).transform((v) => v || null),
});

const emailNeedsSubject = (v: { channel: LeadChannel; subject: string | null }) => v.channel !== "email" || Boolean(v.subject);
const SUBJECT_MESSAGE = { message: "Emails need a subject.", path: ["subject"] };

/** One message: a campaign's content. */
export const LeadMessageContent = MessageFields.refine(emailNeedsSubject, SUBJECT_MESSAGE);
export type LeadMessageContentType = z.infer<typeof LeadMessageContent>;

const isoDate = z.string().datetime({ offset: true }).optional().nullable().or(z.literal("")).transform((v) => v || null);

/**
 * One automation step. Sent either `delayHours` after the previous step (or after the lead came in), or on a date
 * (`at`, e.g. a launch countdown). A step still waiting after `skipAfter` is skipped, not sent: a dated update is
 * stale once its day has passed (36 hours by default), so someone who joins late only gets what's still true.
 */
export const LeadStep = MessageFields.extend({
  delayHours: z.number().min(0).max(24 * 90).default(0),
  at: isoDate,
  skipAfter: isoDate,
}).refine(emailNeedsSubject, SUBJECT_MESSAGE);
export type LeadStepType = z.infer<typeof LeadStep>;

/** How long after its date a dated step may still go out (when it has no skipAfter of its own). */
export const DATED_STEP_GRACE_MS = 36 * 3_600_000;

/** When a step becomes due: on its date, or `delayHours` after `from` (the lead's arrival or the previous step). */
export function stepDueAt(step: Pick<LeadStepType, "at" | "delayHours">, from: Date) {
  return step.at ? new Date(step.at) : new Date(from.getTime() + step.delayHours * 3_600_000);
}

/** True when a step that comes due at `now` is too late to send and should be skipped. */
export function stepIsStale(step: Pick<LeadStepType, "at" | "skipAfter">, now: Date) {
  const limit = step.skipAfter ? Date.parse(step.skipAfter) : step.at ? Date.parse(step.at) + DATED_STEP_GRACE_MS : null;
  return limit !== null && now.getTime() > limit;
}

export function readSteps(value: unknown): LeadStepType[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((step) => {
    const parsed = LeadStep.safeParse(step);
    return parsed.success ? [parsed.data] : [];
  });
}

export type LeadForMessage = { id: string; name: string | null; email: string | null; phone: string | null; kind: string; optedOut: string[] };

/** The address a channel uses for this lead, or null when there is none or they opted out of it. */
export function leadAddress(lead: Pick<LeadForMessage, "email" | "phone" | "optedOut">, channel: LeadChannel) {
  if (lead.optedOut.includes(channel)) return null;
  if (channel === "email") return lead.email || null;
  const phone = (lead.phone ?? "").replace(/[^\d+]/g, "");
  return phone.replace(/\D/g, "").length >= 8 ? phone : null;
}

export function firstName(name: string | null | undefined) {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length > 1 && first.length <= 30 ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

/**
 * Fills {{first_name}}, {{name}} and {{signup_link}}. A missing first name reads "there" ("Hi there"), so a message
 * never says "Hi ,". Unknown tags are left as typed so an admin sees the typo in the preview.
 */
export function personalise(text: string, vars: { name?: string | null; signupLink: string }) {
  const first = firstName(vars.name);
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, first || "there")
    .replace(/\{\{\s*name\s*\}\}/gi, String(vars.name ?? "").trim() || "there")
    .replace(/\{\{\s*signup_link\s*\}\}/gi, vars.signupLink);
}

/** Adds utm_* tags to a link (keeping any it already has). Non-http links are returned unchanged. */
export function withUtm(url: string, utm: { source: string; medium: string; campaign: string }) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return url;
  if (!parsed.searchParams.has("utm_source")) parsed.searchParams.set("utm_source", utm.source);
  if (!parsed.searchParams.has("utm_medium")) parsed.searchParams.set("utm_medium", utm.medium);
  if (!parsed.searchParams.has("utm_campaign")) parsed.searchParams.set("utm_campaign", utm.campaign);
  return parsed.toString();
}

/** "Lagos sellers – June" → "lagos-sellers-june", for utm_campaign. */
export function campaignSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60) || "leads";
}

/** The seller sign-up page, tagged so Admin › Analytics can tell which channel and campaign brought the account. */
export function signupLink(appUrl: string, input: { channel: LeadChannel; campaign: string }) {
  return withUtm(`${appUrl.replace(/\/+$/, "")}/signup`, { source: "shopinbos_leads", medium: input.channel, campaign: campaignSlug(input.campaign) });
}

/** Characters → SMS parts (GSM-7: 160, then 153 a part; anything outside GSM-7 drops to 70 / 67). */
export function smsParts(text: string) {
  const gsm = /^[\n\r A-Za-z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (text.length <= single) return 1;
  return Math.ceil(text.length / multi);
}

/** "Reply STOP" style line WhatsApp and SMS messages end with (SMS keeps it short to save a part). */
export function textOptOutLine(channel: "sms" | "whatsapp", url: string) {
  return channel === "sms" ? `Stop: ${url}` : `Don't want these messages? ${url}`;
}

// ─── Reporting ──────────────────────────────────────────────────────────────────────────────────────────────────

/** 0.1234 → "12.3%"; nothing to divide by → "–". */
export function percent(part: number, whole: number) {
  if (!whole) return "–";
  const value = (part / whole) * 100;
  return `${value >= 10 || value === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

/** The email body: the banner (if any), the text, and a line to reach us on WhatsApp. Shared by send and preview. */
export function leadEmailBodyHtml(input: { body: string; imageUrl?: string | null; imageAlt?: string; whatsappUrl: string; whatsappLabel: string }) {
  const image = input.imageUrl
    ? `<img src="${safeHref(input.imageUrl)}" width="536" alt="${escapeHtml(input.imageAlt ?? "")}" style="display:block;width:100%;max-width:536px;height:auto;margin:0 0 20px;border:0;border-radius:16px">`
    : "";
  const chat = `<p class="sib-muted" style="margin:6px 0 0;font-size:13px;color:${EMAIL_COLORS.muted}">Questions? <a href="${safeHref(input.whatsappUrl)}" class="sib-link" style="color:${EMAIL_COLORS.teal};font-weight:600">Chat with us on WhatsApp</a> (${escapeHtml(input.whatsappLabel)}).</p>`;
  return `${image}${html.text(input.body)}${chat}`;
}
