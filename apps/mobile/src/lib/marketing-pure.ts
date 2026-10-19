// Automations and email templates on the phone (app/marketing): the rules the screens share, without React
// Native so tests can load them. Steps are the web's flow steps (src/lib/marketing/flows.ts); the phone edits only
// the words in them (email subjects, SMS, WhatsApp text, notes to the seller), the waits and the win-back days.

export type FlowStep =
  | { type: "wait"; minutes: number }
  | { type: "condition"; check: string; segmentId?: string | null }
  | { type: "send_email"; subject: string; bodyHtml: string; templateId?: string | null }
  | { type: "send_sms"; message: string }
  | { type: "send_whatsapp"; message: string; template?: string | null; variables?: string[]; headerImageUrl?: string | null }
  | { type: "add_tag"; tag: string }
  | { type: "give_discount"; percent: number; days: number }
  | { type: "request_review" }
  | { type: "notify_seller"; message: string };

export interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  active: boolean;
  preset: string | null;
  steps: FlowStep[];
  settings: { days?: number };
  messages: number;
  inFlow: number;
  total: number;
  sent30d: number;
  lastTriggeredAt: string | null;
}

/** Waits in whole days, hours or minutes, the way the web shows them. */
export function waitParts(minutes: number): { amount: number; unit: "days" | "hours" | "minutes" } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

export function waitMinutes(amount: number, unit: "days" | "hours" | "minutes") {
  const whole = Math.max(1, Math.round(Number(amount) || 0));
  return Math.min(unit === "days" ? whole * 1440 : unit === "hours" ? whole * 60 : whole, 60 * 24 * 365);
}

/** Which of a step's words the phone can change ("subject", "message"), or null when the step has none. */
export function editableField(step: FlowStep): "subject" | "message" | null {
  if (step.type === "send_email") return "subject";
  if (step.type === "send_sms" || step.type === "notify_seller") return "message";
  // A WhatsApp template's words are fixed by WhatsApp; only free text can change.
  if (step.type === "send_whatsapp" && !step.template) return "message";
  return null;
}

/** A copy of the steps with one step's words or wait changed (the rest kept exactly, for PATCH). */
export function changeStep(steps: FlowStep[], index: number, patch: { subject?: string; message?: string; minutes?: number }): FlowStep[] {
  return steps.map((step, n) => {
    if (n !== index) return step;
    if (step.type === "send_email" && patch.subject !== undefined) return { ...step, subject: patch.subject.slice(0, 200) };
    if ((step.type === "send_sms" || step.type === "notify_seller" || step.type === "send_whatsapp") && patch.message !== undefined) return { ...step, message: patch.message.slice(0, step.type === "notify_seller" ? 500 : 1000) };
    if (step.type === "wait" && patch.minutes !== undefined) return { ...step, minutes: Math.max(1, Math.round(patch.minutes)) };
    return step;
  });
}

/** What would stop the flow from switching on, as the web checks it: empty words, an SMS longer than 3 parts. */
export function stepGaps(steps: FlowStep[]) {
  const gaps: { index: number; reason: "empty" | "smsLong" | "noSteps" }[] = [];
  if (!steps.length) gaps.push({ index: -1, reason: "noSteps" });
  steps.forEach((step, index) => {
    if (step.type === "send_sms" && !step.message.trim()) gaps.push({ index, reason: "empty" });
    if (step.type === "send_sms" && step.message.length > 480) gaps.push({ index, reason: "smsLong" });
    if (step.type === "send_whatsapp" && !step.template && !step.message.trim()) gaps.push({ index, reason: "empty" });
    if (step.type === "send_email" && !step.subject.trim() && !step.templateId) gaps.push({ index, reason: "empty" });
  });
  return gaps;
}

/** The PATCH body for /api/app/marketing/automations/:id. */
export function flowPatch(flow: Pick<FlowRow, "name" | "trigger" | "steps" | "settings">, changes: { name?: string; steps?: FlowStep[]; days?: number; active?: boolean }) {
  const days = changes.days ?? flow.settings.days;
  return {
    name: (changes.name ?? flow.name).trim().slice(0, 80) || flow.name,
    steps: changes.steps ?? flow.steps,
    settings: flow.trigger === "win_back" && days ? { days: Math.max(1, Math.min(3650, Math.round(days))) } : flow.settings,
    ...(changes.active !== undefined ? { active: changes.active } : {}),
  };
}

// ─── Email preview ──────────────────────────────────────────────────────────

export type PreviewPart = { kind: "heading" | "text"; text: string } | { kind: "image"; url: string } | { kind: "button"; text: string; url: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", middot: "·", rarr: "→", larr: "←", times: "×", bull: "•", copy: "©" };

/** Sample customer details for previews (the web's preview uses the same kind of stand-ins). */
export const SAMPLE_DETAILS: Record<string, string> = {
  name: "Ada",
  full_name: "Ada Obi",
  order_number: "1024",
  order_total: "₦25,000",
  cart_items: "Ankara wrap dress",
  cart_total: "₦28,500",
  product_name: "Ankara wrap dress",
  discount_code: "SAVE10",
  currency: "₦",
};

function decode(text: string) {
  return text.replace(/&(#\d+|#x[\da-f]+|[a-z]+\d*);/gi, (whole, name: string) => {
    if (ENTITIES[name.toLowerCase()] !== undefined) return ENTITIES[name.toLowerCase()];
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return whole;
  });
}

/** {{name}} → "Ada", {{store}} → the shop's name…; unknown ones are left out. */
export function fillSample(text: string, sample: Record<string, string>) {
  return text.replace(/{{\s*([a-z_]+)\s*}}/g, (_, key: string) => sample[key] ?? "");
}

/**
 * An email's HTML as plain parts the phone can show: headings, paragraphs, pictures and buttons (links styled as
 * buttons). Hidden bits (comments, styles, the preview line) are left out; {{variables}} get sample values.
 */
export function emailPreviewParts(html: string, sample: Record<string, string> = {}): PreviewPart[] {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<div[^>]*display:\s*none[\s\S]*?<\/div>/gi, "");
  const parts: PreviewPart[] = [];
  const pattern = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>|<a\b[^>]*href="([^"]*)"[^>]*style="[^"]*(?:display:\s*inline-block|background)[^"]*"[^>]*>([\s\S]*?)<\/a>|<(h[1-4])\b[^>]*>([\s\S]*?)<\/\4>|<(p|li|td|div)\b[^>]*>([\s\S]*?)<\/\6>/gi;
  const text = (raw: string) => fillSample(decode(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")), sample).replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(clean))) {
    if (match[1]) {
      const url = fillSample(decode(match[1]), sample);
      if (/^https:\/\//.test(url)) parts.push({ kind: "image", url });
    } else if (match[3] !== undefined) {
      const label = text(match[3]);
      if (label) parts.push({ kind: "button", text: label, url: fillSample(decode(match[2] ?? ""), sample) });
    } else if (match[4]) {
      const heading = text(match[5]);
      if (heading) parts.push({ kind: "heading", text: heading });
    } else if (match[6]) {
      const inner = match[7];
      // A block holding pictures or buttons: read what's inside it instead.
      if (/<(img|a\b[^>]*inline-block|h[1-4]|p\b|div\b)/i.test(inner)) {
        parts.push(...emailPreviewParts(inner, sample));
        continue;
      }
      const words = text(inner);
      if (words) parts.push({ kind: "text", text: words });
    }
  }
  // Plain text emails (no tags at all).
  if (!parts.length) {
    const words = text(clean);
    if (words) parts.push({ kind: "text", text: words });
  }
  return parts;
}
