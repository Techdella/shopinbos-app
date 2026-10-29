// WhatsApp in the admin inbox: the team's message templates, the 24-hour reply window and phone clean-up. Pure,
// unit-tested in tests/admin-team.test.mjs.
//
// WhatsApp lets a business send free text only within 24 hours of the person's last message. To start a chat, or
// to pick one up after that, the team sends an approved template. These two are the team's own (the lead
// sequences' templates live in src/lib/lead-growth/whatsapp-content.ts). Meta doesn't allow a variable at the very
// start or end of a template, and a variable can't hold new lines, so the note is flattened to one line.
import { greetingName } from "../../../shared/person-name.ts";

export const WHATSAPP_WINDOW_HOURS = 24;

export type TeamTemplateParam = "first_name" | "agent" | "note" | "business";

export type TeamTemplate = {
  /** Meta template name: lower case, digits and _. */
  name: string;
  /** What it's for, in the composer's picker. */
  purpose: string;
  /** Written by the team in Admin › Inbox › WhatsApp templates (the others are built in). */
  custom?: boolean;
  category: "UTILITY" | "MARKETING";
  language: string;
  /** Body with {{1}}, {{2}}… in the order of `params`. */
  body: string;
  params: TeamTemplateParam[];
  sample: string[];
};

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    name: "shopinbos_team_followup",
    purpose: "A message you write (follow-ups, answers, updates)",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, it's {{2}} from the Shopinbos team. {{3}}\n\nReply to this message and we'll carry on the conversation here.",
    params: ["first_name", "agent", "note"],
    sample: ["Ada", "Tolu", "Your supplier account is approved, so you can add your products now."],
  },
  {
    name: "shopinbos_account_approved",
    purpose: "Approval: their business is verified",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, good news: {{2}} is now verified on Shopinbos. {{3}}\n\nIf you need help getting set up, reply to this message and the team will help you.",
    params: ["first_name", "business", "note"],
    sample: ["Ada", "Ada's Logistics", "Sellers can now find you and book your deliveries."],
  },
  {
    name: "shopinbos_account_update",
    purpose: "Verification update (not approved yet, what's needed)",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, an update on the Shopinbos verification for {{2}}: {{3}}\n\nReply to this message if you have any questions and the team will help.",
    params: ["first_name", "business", "note"],
    sample: ["Ada", "Ada Supplies", "we couldn't read the CAC certificate you uploaded, please upload a clearer copy"],
  },
  {
    name: "shopinbos_team_reconnect",
    purpose: "Pick up an earlier conversation",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, this is the Shopinbos team getting back to you about your earlier message. Reply here whenever you're ready and we'll continue.",
    params: ["first_name"],
    sample: ["Ada"],
  },
  // After a partnership call (src/lib/lead-growth/whatsapp-content.ts has the cold outreach). The note is what was
  // agreed on the call, e.g. "As promised, our team will call you on Thursday to set up your first 10 products."
  {
    name: "shopinbos_partner_supplier_after_call",
    purpose: "After a call: supplier partner (what you agreed, plus how to register)",
    category: "MARKETING",
    language: "en",
    body: "Hi {{1}}, it's {{2}} from Shopinbos. Thank you for speaking with us about becoming a supplier partner.\n\n{{3}}\n\nWhen you're ready, register at https://app.shopinbos.com/supplier/signup and add your products, or reply here and we'll set up your listing with you. You can also email hello@shopinbos.com.",
    params: ["first_name", "agent", "note"],
    sample: ["Ada", "Tolu", "As promised, we'll call you on Thursday at 11am to set up your first 10 products together."],
  },
  {
    name: "shopinbos_partner_delivery_after_call",
    purpose: "After a call: delivery / logistics partner (what you agreed, plus how to register)",
    category: "MARKETING",
    language: "en",
    body: "Hi {{1}}, it's {{2}} from Shopinbos. Thank you for speaking with us about delivering for sellers on Shopinbos.\n\n{{3}}\n\nWhen you're ready, register at https://app.shopinbos.com/logistics/signup and set your areas and prices, or reply here and we'll set it up with you. You can also email hello@shopinbos.com.",
    params: ["first_name", "agent", "note"],
    sample: ["Ada", "Tolu", "As discussed, you'll start with Lagos Island and Mainland, and we'll verify your company this week."],
  },
  {
    name: "shopinbos_partner_seller_after_call",
    purpose: "After a call: seller getting a free store (what you agreed, plus how to start)",
    category: "MARKETING",
    language: "en",
    body: "Hi {{1}}, it's {{2}} from Shopinbos. Thank you for speaking with us about your free online store.\n\n{{3}}\n\nWhen you're ready, start at https://app.shopinbos.com/signup and Rex will build your store with you in minutes, or reply here and our team will set it up for you. You can also email hello@shopinbos.com.",
    params: ["first_name", "agent", "note"],
    sample: ["Ada", "Tolu", "As promised, send us your logo and 5 product photos here and we'll have your store ready by Friday."],
  },
];

export function teamTemplate(name: string | null | undefined) {
  return TEAM_TEMPLATES.find((template) => template.name === name) ?? null;
}

export type TeamTemplateValues = { name: string | null; agent: string; note?: string | null; business?: string | null };

const firstName = (name: string | null | undefined) => greetingName(name);

/** A template variable: one line, no tabs, no runs of spaces (Meta rejects them), at most 900 characters. */
export function templateVariable(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

export function teamTemplateParams(template: TeamTemplate, values: TeamTemplateValues): string[] {
  return template.params.map((param) =>
    templateVariable(
      param === "first_name" ? firstName(values.name) : param === "agent" ? firstName(values.agent) : param === "business" ? values.business?.trim() || values.name?.trim() || "your business" : values.note ?? "",
    ),
  );
}

/** What the person sees, for the thread in the inbox. */
export function renderTeamTemplate(template: TeamTemplate, values: TeamTemplateValues) {
  const params = teamTemplateParams(template, values);
  return template.body.replace(/\{\{(\d+)\}\}/g, (_, index: string) => params[Number(index) - 1] ?? "");
}

/** What's missing before it can be sent ("note" templates need the note). */
export function teamTemplateProblem(template: TeamTemplate, values: TeamTemplateValues) {
  if (template.params.includes("note") && !templateVariable(values.note ?? "")) return "Write the message to send.";
  return null;
}

/** The template in Meta's format for POST /{WABA_ID}/message_templates (text only, with sample values). */
export function metaTeamTemplatePayload(template: TeamTemplate) {
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    allow_category_change: true,
    components: [{ type: "BODY", text: template.body, example: { body_text: [template.sample] } }],
  };
}

/** Free text can go out while the person's last WhatsApp message is under 24 hours old. */
export function whatsappWindowOpen(lastInboundAt: Date | string | null | undefined, now = Date.now()) {
  if (!lastInboundAt) return false;
  return now - new Date(lastInboundAt).getTime() < WHATSAPP_WINDOW_HOURS * 3_600_000;
}

/** Hours left in the window (rounded down), or 0. */
export function whatsappWindowHoursLeft(lastInboundAt: Date | string | null | undefined, now = Date.now()) {
  if (!lastInboundAt) return 0;
  const left = WHATSAPP_WINDOW_HOURS * 3_600_000 - (now - new Date(lastInboundAt).getTime());
  return left > 0 ? Math.floor(left / 3_600_000) : 0;
}

/**
 * A phone number as +<digits> for WhatsApp: "+234 803 412 7790", "2348034127790" and the local "08034127790"
 * (Nigeria) all become "+2348034127790". Null when it can't be a phone number.
 */
export function whatsappPhone(raw: string | null | undefined) {
  const trimmed = (raw ?? "").trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && digits.length === 11 && digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/**
 * The last ten digits of a phone number: the part every way it gets stored shares ("+2348069394531",
 * "2348069394531" from Supabase Auth or a WhatsApp wa_id, "08069394531" typed by hand). Null when it isn't one.
 */
export function phoneTail(raw: string | null | undefined) {
  const phone = whatsappPhone(raw);
  return phone ? phone.slice(-10) : null;
}

/** Of the accounts whose phone ends the same way, the one that is really this number: exact first, else the first. */
export function pickPhoneMatch<T extends { phone: string | null }>(raw: string | null | undefined, candidates: T[]): T | null {
  const phone = whatsappPhone(raw);
  const tail = phoneTail(raw);
  if (!phone || !tail) return null;
  const same = candidates.filter((row) => phoneTail(row.phone) === tail);
  return same.find((row) => whatsappPhone(row.phone) === phone) ?? same[0] ?? null;
}

/** "STOP", "Stop.", "unsubscribe": the person wants no more marketing on WhatsApp. */
export function isStopMessage(text: string) {
  return /^\s*(stop|unsubscribe|stop promotions|opt out|optout)\s*[.!]?\s*$/i.test(text);
}

// ─── Templates the team writes (Admin › Inbox › WhatsApp templates) ───────────

/** What the team types in a template, and what each one becomes. */
export const TEMPLATE_PLACEHOLDERS: Array<{ key: string; param: TeamTemplateParam; label: string; sample: string }> = [
  { key: "first_name", param: "first_name", label: "Their first name", sample: "Ada" },
  { key: "business", param: "business", label: "Their business name", sample: "Ada Supplies" },
  { key: "agent", param: "agent", label: "Your first name", sample: "Tolu" },
  { key: "message", param: "note", label: "A message you write when sending", sample: "Your account is ready, so you can start now." },
];

export type TemplateDraft = { name: string; purpose: string; category: string; body: string };

/** Meta's template name: lower case letters, digits and _, starting shopinbos_. */
export function templateName(raw: string) {
  const slug = raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  if (!slug) return "";
  return slug.startsWith("shopinbos_") ? slug : `shopinbos_${slug}`;
}

/**
 * The team's text ("Hi {{first_name}}, …{{message}}…") as a template Meta accepts: placeholders become {{1}},
 * {{2}}… in order, each used once. Refuses what Meta would reject: unknown placeholders, one at the very start or
 * end, two side by side, or text over 1,024 characters.
 */
export function templateFromDraft(draft: TemplateDraft): { ok: true; template: TeamTemplate } | { ok: false; error: string } {
  const name = templateName(draft.name);
  if (!name || name === "shopinbos_") return { ok: false, error: "Give it a name, like supplier welcome." };
  if (TEAM_TEMPLATES.some((t) => t.name === name)) return { ok: false, error: "That name is a built-in template. Pick another." };
  const purpose = draft.purpose.trim().slice(0, 120);
  if (!purpose) return { ok: false, error: "Say what it's for, so the team picks the right one." };
  const category = draft.category === "MARKETING" ? "MARKETING" : "UTILITY";
  const text = draft.body.replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, error: "Write the message." };
  if (text.length > 1024) return { ok: false, error: "Keep it under 1,024 characters (WhatsApp's limit)." };
  const params: TeamTemplateParam[] = [];
  let unknown: string | null = null;
  const body = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const placeholder = TEMPLATE_PLACEHOLDERS.find((p) => p.key === key.toLowerCase());
    if (!placeholder) {
      unknown = match;
      return match;
    }
    params.push(placeholder.param);
    return `{{${params.length}}}`;
  });
  if (unknown) return { ok: false, error: `${unknown} isn't something we can fill in. Use ${TEMPLATE_PLACEHOLDERS.map((p) => `{{${p.key}}}`).join(", ")}.` };
  if (/\{\{(?!\d+\}\})/.test(body)) return { ok: false, error: "Check the {{ }}: each one needs a name inside, like {{first_name}}." };
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*[.!?]?\s*$/.test(body)) return { ok: false, error: "WhatsApp doesn't allow a {{ }} at the very start or end. Add a word before or after it." };
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) return { ok: false, error: "Put some words between two {{ }}." };
  const sample = params.map((param) => TEMPLATE_PLACEHOLDERS.find((p) => p.param === param)!.sample);
  return { ok: true, template: { name, purpose, category, language: "en", body, params, sample, custom: true } };
}

/** A custom template read back from storage, or null when it no longer passes the rules. */
export function readCustomTemplate(value: unknown): TeamTemplate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== "string" || typeof row.body !== "string" || !Array.isArray(row.params)) return null;
  const params = row.params.filter((p): p is TeamTemplateParam => ["first_name", "agent", "note", "business"].includes(String(p)));
  return {
    name: row.name,
    purpose: typeof row.purpose === "string" ? row.purpose : row.name,
    category: row.category === "MARKETING" ? "MARKETING" : "UTILITY",
    language: typeof row.language === "string" ? row.language : "en",
    body: row.body,
    params,
    sample: Array.isArray(row.sample) ? row.sample.map(String) : [],
    custom: true,
  };
}

/** The template body as the team wrote it ({{1}} back to {{first_name}}), for showing and editing. */
export function templateText(template: TeamTemplate) {
  return template.body.replace(/\{\{(\d+)\}\}/g, (match, index: string) => {
    const param = template.params[Number(index) - 1];
    const placeholder = TEMPLATE_PLACEHOLDERS.find((p) => p.param === param);
    return placeholder ? `{{${placeholder.key}}}` : match;
  });
}

// ─── When WhatsApp won't deliver ──────────────────────────────────────────────

/**
 * Meta accepted the message, then refused to deliver it for its own reasons (its limit on business messages to
 * someone who hasn't written to us, or a WhatsApp experiment). Nothing we can fix on WhatsApp, so the inbox sends
 * the same words by SMS instead.
 */
export function metaRefusedDelivery(error: string | null | undefined) {
  return /healthy ecosystem|part of an experiment|\b131049\b|\b130472\b/i.test(error ?? "");
}

/** What the inbox shows under a WhatsApp message that didn't arrive. */
export function whatsappFailureText(error: string | null | undefined) {
  if (/healthy ecosystem|\b131049\b/i.test(error ?? "")) return "Meta held this back: it limits business messages to people who haven't written to us, and they haven't. Don't resend on WhatsApp for now.";
  if (/part of an experiment|\b130472\b/i.test(error ?? "")) return "Meta held this back: their number is in a WhatsApp experiment that blocks business messages.";
  return error || "WhatsApp couldn't deliver it.";
}

/** The SMS copy of a team message: the WhatsApp-only "reply here" line goes, and it fits in three texts. */
export function smsFallbackText(body: string) {
  const text = body
    .replace(/\n*Reply to this message[^\n]*$/i, "")
    .replace(/\n*Reply here whenever[^\n]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const framed = /shopinbos/i.test(text) ? text : `Shopinbos: ${text}`;
  return framed.length > 459 ? `${framed.slice(0, 458).trimEnd()}…` : framed;
}
