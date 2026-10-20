// WhatsApp in the admin inbox: the team's message templates, the 24-hour reply window and phone clean-up. Pure,
// unit-tested in tests/admin-team.test.mjs.
//
// WhatsApp lets a business send free text only within 24 hours of the person's last message. To start a chat, or
// to pick one up after that, the team sends an approved template. These two are the team's own (the lead
// sequences' templates live in src/lib/lead-growth/whatsapp-content.ts). Meta doesn't allow a variable at the very
// start or end of a template, and a variable can't hold new lines, so the note is flattened to one line.

export const WHATSAPP_WINDOW_HOURS = 24;

export type TeamTemplateParam = "first_name" | "agent" | "note";

export type TeamTemplate = {
  /** Meta template name: lower case, digits and _. */
  name: string;
  /** What it's for, in the composer's picker. */
  purpose: string;
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
    name: "shopinbos_team_reconnect",
    purpose: "Pick up an earlier conversation",
    category: "UTILITY",
    language: "en",
    body: "Hi {{1}}, this is the Shopinbos team getting back to you about your earlier message. Reply here whenever you're ready and we'll continue.",
    params: ["first_name"],
    sample: ["Ada"],
  },
];

export function teamTemplate(name: string | null | undefined) {
  return TEAM_TEMPLATES.find((template) => template.name === name) ?? null;
}

export type TeamTemplateValues = { name: string | null; agent: string; note?: string | null };

const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || "there";

/** A template variable: one line, no tabs, no runs of spaces (Meta rejects them), at most 900 characters. */
export function templateVariable(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 900);
}

export function teamTemplateParams(template: TeamTemplate, values: TeamTemplateValues): string[] {
  return template.params.map((param) =>
    templateVariable(param === "first_name" ? firstName(values.name) : param === "agent" ? firstName(values.agent) : values.note ?? ""),
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

/** "STOP", "Stop.", "unsubscribe": the person wants no more marketing on WhatsApp. */
export function isStopMessage(text: string) {
  return /^\s*(stop|unsubscribe|stop promotions|opt out|optout)\s*[.!]?\s*$/i.test(text);
}
