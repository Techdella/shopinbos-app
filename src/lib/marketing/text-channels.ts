// SMS and WhatsApp marketing rules, pure (no server imports): the SMS segment counter, cost estimates,
// STOP / START keywords, who may get a text (consent and opt-outs), and WhatsApp message templates (ready-made
// drafts, validation, Meta's component format, and filling {{1}}..{{n}} from a variable mapping).
// Used by the campaign builder, the senders, the webhooks' opt-out hook and tests/marketing-channels.test.mjs.

// ─── SMS segments ─────────────────────────────────────────────────────────────

/** GSM 03.38 basic character set: one septet each. */
const GSM7_BASIC = new Set(
  Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"),
);
/** GSM 03.38 extension table: an escape plus the character, so two septets each. */
const GSM7_EXTENDED = new Set(Array.from("^{}\\[~]|€\f"));

export interface SmsCount {
  encoding: "GSM-7" | "UCS-2";
  /** Septets (GSM-7) or UTF-16 code units (UCS-2) the message uses. */
  units: number;
  segments: number;
  /** Units per segment for this message: 160/153 (GSM-7) or 70/67 (UCS-2). */
  perSegment: number;
  /** Units left before another segment is needed. */
  remaining: number;
  /** Characters that forced UCS-2 (emoji, curly quotes…), so the seller can replace them. */
  unicodeChars: string[];
}

/**
 * How many SMS parts a message takes. Plain GSM-7 text fits 160 septets in one SMS and 153 per part when split
 * (the rest is the concatenation header); extension characters (€ [ ] { } ~ ^ \ |) take two septets and never
 * straddle two parts. Anything outside GSM-7 switches the whole message to UCS-2: 70 code units, or 67 per part,
 * and an emoji (a surrogate pair) is never split.
 */
export function smsSegments(text: string): SmsCount {
  const chars = Array.from(text ?? "");
  const unicodeChars = [...new Set(chars.filter((ch) => !GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch)))];
  if (!chars.length) return { encoding: "GSM-7", units: 0, segments: 0, perSegment: 160, remaining: 160, unicodeChars: [] };
  const gsm = unicodeChars.length === 0;
  const sizes = chars.map((ch) => (gsm ? (GSM7_EXTENDED.has(ch) ? 2 : 1) : ch.length));
  const units = sizes.reduce((sum, n) => sum + n, 0);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  if (units <= single) return { encoding: gsm ? "GSM-7" : "UCS-2", units, segments: 1, perSegment: single, remaining: single - units, unicodeChars };
  let segments = 1;
  let used = 0;
  for (const size of sizes) {
    if (used + size > multi) {
      segments += 1;
      used = 0;
    }
    used += size;
  }
  return { encoding: gsm ? "GSM-7" : "UCS-2", units, segments, perSegment: multi, remaining: multi - used, unicodeChars };
}

/** Total cost of a send, or null when the per-segment price isn't known (the UI then shows no estimate). */
export function estimateSmsCost(segments: number, recipients: number, costPerSegment: number | null | undefined): number | null {
  if (costPerSegment == null || !Number.isFinite(costPerSegment) || costPerSegment <= 0) return null;
  return Math.round(segments * Math.max(0, recipients) * costPerSegment * 100) / 100;
}

/** Alphanumeric sender IDs: 3-11 letters, digits or spaces, at least one letter (carrier rules in Nigeria/Kenya/Ghana). */
export function validSenderId(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[A-Za-z0-9 ]{3,11}$/.test(value) && /[A-Za-z]/.test(value);
}

// ─── Opt-out keywords ─────────────────────────────────────────────────────────

export type OptKeyword = { action: "stop"; scope: "marketing" | "all"; keyword: string } | { action: "start"; keyword: string };

const SMS_STOP = ["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "STOP PROMO", "STOP PROMOS", "REMOVE ME"];
// On WhatsApp customers write freely ("cancel" may be about an order), so only clear opt-out phrases count.
const WHATSAPP_STOP = ["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "OPTOUT", "OPT OUT", "REMOVE ME"];
// The quick-reply button Meta adds to marketing templates, and its usual wording: stops promotions only.
const WHATSAPP_STOP_MARKETING = ["STOP PROMOTIONS", "STOP PROMOTION", "STOP PROMO", "STOP PROMOS", "STOP MARKETING"];
const START = ["START", "UNSTOP", "RESUME", "SUBSCRIBE"];

/** Normalises a reply ("Stop.", " stop!! ") to its keyword form ("STOP"). */
export function keywordOf(text: string | null | undefined) {
  return String(text ?? "")
    .normalize("NFKD")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether an inbound SMS or WhatsApp message is an opt-out (STOP) or opt-back-in (START). Whole-message match only. */
export function optKeyword(text: string | null | undefined, channel: "sms" | "whatsapp"): OptKeyword | null {
  const word = keywordOf(text);
  if (!word || word.length > 24) return null;
  if (START.includes(word)) return { action: "start", keyword: word };
  if (channel === "whatsapp" && WHATSAPP_STOP_MARKETING.includes(word)) return { action: "stop", scope: "marketing", keyword: word };
  if ((channel === "sms" ? SMS_STOP : WHATSAPP_STOP).includes(word)) return { action: "stop", scope: "all", keyword: word };
  return null;
}

// ─── Who may get a text ───────────────────────────────────────────────────────

export type TextChannel = "sms" | "whatsapp";
export type MessagePurpose = "marketing" | "transactional";

export interface OptOutRow {
  phone: string;
  channel: string;
  scope: string;
}

/** Opt-outs as lookups: marketing sends skip any opt-out; order messages skip only "all". */
export function optOutIndex(rows: OptOutRow[]) {
  const index = { sms: new Map<string, string>(), whatsapp: new Map<string, string>() };
  for (const row of rows) {
    if (row.channel !== "sms" && row.channel !== "whatsapp") continue;
    const map = index[row.channel];
    if (map.get(row.phone) !== "all") map.set(row.phone, row.scope === "marketing" ? "marketing" : "all");
  }
  return index;
}

export type OptOutLookup = ReturnType<typeof optOutIndex>;

export function isOptedOut(index: OptOutLookup, channel: TextChannel, phone: string, purpose: MessagePurpose) {
  const scope = index[channel].get(phone);
  if (!scope) return false;
  return purpose === "marketing" ? true : scope === "all";
}

export interface TextContact {
  phone: string | null;
  smsOk: boolean;
  whatsappOk: boolean;
}

/**
 * Contacts a marketing text may go to on a channel: they have a phone, gave consent for that channel (smsOk /
 * whatsappOk, from their latest consent record) and haven't opted out since. One message per phone number.
 */
export function consentedForChannel<T extends TextContact>(contacts: T[], channel: TextChannel, optOuts: OptOutLookup): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const contact of contacts) {
    if (!contact.phone || seen.has(contact.phone)) continue;
    if (!(channel === "sms" ? contact.smsOk : contact.whatsappOk)) continue;
    if (isOptedOut(optOuts, channel, contact.phone, "marketing")) continue;
    seen.add(contact.phone);
    out.push(contact);
  }
  return out;
}

/**
 * Whether one message may go to one person. Marketing needs that channel's consent; order messages (confirmed,
 * paid, shipped, delivered, the cart they left) may go to the phone the buyer gave at checkout. Both stop at
 * an opt-out, except that a "stop promotions" opt-out still lets order messages through.
 */
export function mayText(input: { channel: TextChannel; phone: string | null | undefined; purpose: MessagePurpose; consent: boolean; optOuts: OptOutLookup }): { ok: true } | { ok: false; reason: string } {
  if (!input.phone) return { ok: false, reason: "No phone number" };
  if (isOptedOut(input.optOuts, input.channel, input.phone, input.purpose)) return { ok: false, reason: `They opted out of ${input.channel === "sms" ? "SMS" : "WhatsApp"}` };
  if (input.purpose === "marketing" && !input.consent) return { ok: false, reason: `No ${input.channel === "sms" ? "SMS" : "WhatsApp"} permission` };
  return { ok: true };
}

/** Automation triggers whose messages are about the person's own order or cart. Everything else is marketing. */
export const TRANSACTIONAL_TRIGGERS = ["order_placed", "payment_received", "order_shipped", "order_delivered", "post_purchase", "review_request", "abandoned_checkout"] as const;

export function purposeOfTrigger(trigger: string): MessagePurpose {
  return (TRANSACTIONAL_TRIGGERS as readonly string[]).includes(trigger) ? "transactional" : "marketing";
}

// ─── WhatsApp templates ───────────────────────────────────────────────────────

export type TemplateCategory = "MARKETING" | "UTILITY";
export type TemplateStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED" | "IN_APPEAL" | "LOCAL_ERROR";

export interface TemplateButton {
  type: "URL" | "QUICK_REPLY";
  text: string;
  url?: string;
}

export interface TemplateContent {
  header: { format: "NONE" | "TEXT" | "IMAGE"; text?: string };
  body: string;
  footer?: string;
  buttons: TemplateButton[];
}

/** What a {{n}} placeholder can be filled with. */
export const TEMPLATE_VARIABLES = {
  first_name: { label: "First name", sample: "Ada" },
  store_name: { label: "Store name", sample: "Adire House" },
  discount_code: { label: "Discount code", sample: "ADIRE-20" },
  link: { label: "Link to your shop", sample: "https://adire.shopinbos.com" },
  order_number: { label: "Order number", sample: "SIB-1042" },
  order_total: { label: "Order total", sample: "₦24,500" },
  order_link: { label: "Order page link", sample: "https://adire.shopinbos.com/order/1042" },
  tracking_code: { label: "Tracking code", sample: "GIG-88213" },
  tracking_link: { label: "Tracking link", sample: "https://track.example.com/GIG-88213" },
  cart_link: { label: "Cart link", sample: "https://adire.shopinbos.com/cart?recover=abc" },
  cart_items: { label: "Cart items", sample: "Adire kaftan × 1" },
  product_name: { label: "Product name", sample: "Adire kaftan" },
  product_link: { label: "Product link", sample: "https://adire.shopinbos.com/product/kaftan" },
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;
export const TEMPLATE_VARIABLE_KEYS = Object.keys(TEMPLATE_VARIABLES) as TemplateVariable[];

/** {{1}}, {{2}}… in order of appearance, deduplicated. */
export function placeholders(text: string | null | undefined): number[] {
  const found: number[] = [];
  for (const match of String(text ?? "").matchAll(/{{\s*(\d+)\s*}}/g)) {
    const n = Number(match[1]);
    if (!found.includes(n)) found.push(n);
  }
  return found;
}

/** How many body variables the template needs ({{1}}..{{n}}). */
export function variableCount(content: TemplateContent) {
  const used = placeholders(content.body);
  return used.length ? Math.max(...used) : 0;
}

export const TEMPLATE_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "en_GB", label: "English (UK)" },
  { code: "en_US", label: "English (US)" },
  { code: "fr", label: "French" },
  { code: "pt_BR", label: "Portuguese (Brazil)" },
  { code: "sw", label: "Swahili" },
  { code: "ha", label: "Hausa" },
  { code: "zu", label: "Zulu" },
  { code: "af", label: "Afrikaans" },
  { code: "ar", label: "Arabic" },
];

/** Problems Meta would reject a template for, in words a seller understands. Empty when it's fine to submit. */
export function templateProblems(input: { name: string; category: string; language: string; content: TemplateContent; variables: string[] }): string[] {
  const problems: string[] = [];
  const { content } = input;
  if (!/^[a-z0-9_]{1,512}$/.test(input.name)) problems.push("The name can only use lowercase letters, numbers and underscores (e.g. order_shipped).");
  if (input.category !== "MARKETING" && input.category !== "UTILITY") problems.push("Pick Marketing or Utility.");
  if (!TEMPLATE_LANGUAGES.some((l) => l.code === input.language)) problems.push("Pick a language.");
  const body = content.body.trim();
  if (!body) problems.push("Write the message.");
  if (body.length > 1024) problems.push("The message is longer than WhatsApp allows (1,024 characters).");
  const used = placeholders(body);
  const n = used.length ? Math.max(...used) : 0;
  for (let i = 1; i <= n; i++) if (!used.includes(i)) problems.push(`Variables must go {{1}}, {{2}}, … in order without gaps; {{${i}}} is missing.`);
  if (/^\s*{{\s*\d+\s*}}/.test(body) || /{{\s*\d+\s*}}\s*$/.test(body)) problems.push("Meta rejects messages that start or end with a variable. Add words before and after it.");
  for (let i = 1; i <= n; i++) {
    const key = input.variables[i - 1];
    if (!key || !(key in TEMPLATE_VARIABLES)) problems.push(`Choose what {{${i}}} is filled with.`);
  }
  if (content.header.format === "TEXT") {
    const text = (content.header.text ?? "").trim();
    if (!text) problems.push("Write the header, or choose no header.");
    if (text.length > 60) problems.push("The header can be at most 60 characters.");
    if (placeholders(text).length) problems.push("Keep the header without variables.");
  }
  if ((content.footer ?? "").length > 60) problems.push("The footer can be at most 60 characters.");
  if (placeholders(content.footer).length) problems.push("Keep the footer without variables.");
  if (content.buttons.length > 3) problems.push("Use at most 3 buttons.");
  for (const button of content.buttons) {
    if (!button.text.trim() || button.text.length > 25) problems.push("Button labels need 1-25 characters.");
    if (button.type === "URL" && !/^https:\/\/[^\s]+$/.test(button.url ?? "")) problems.push(`The "${button.text || "link"}" button needs an https:// link.`);
    if (button.type === "URL" && placeholders(button.url).length) problems.push("Button links can't have variables here; link to a fixed page.");
  }
  return [...new Set(problems)];
}

/** The template in Meta's format for POST /{WABA_ID}/message_templates, with sample values for each variable. */
export function toMetaComponents(content: TemplateContent, variables: string[], headerSampleHandle?: string | null): Array<Record<string, unknown>> {
  const components: Array<Record<string, unknown>> = [];
  if (content.header.format === "TEXT" && content.header.text?.trim()) components.push({ type: "HEADER", format: "TEXT", text: content.header.text.trim() });
  if (content.header.format === "IMAGE") components.push({ type: "HEADER", format: "IMAGE", ...(headerSampleHandle ? { example: { header_handle: [headerSampleHandle] } } : {}) });
  const n = variableCount(content);
  const samples = Array.from({ length: n }, (_, i) => TEMPLATE_VARIABLES[(variables[i] as TemplateVariable) ?? "first_name"]?.sample ?? "Ada");
  components.push({ type: "BODY", text: content.body.trim(), ...(n ? { example: { body_text: [samples] } } : {}) });
  if (content.footer?.trim()) components.push({ type: "FOOTER", text: content.footer.trim() });
  if (content.buttons.length) {
    components.push({
      type: "BUTTONS",
      buttons: content.buttons.map((b) => (b.type === "URL" ? { type: "URL", text: b.text.trim(), url: b.url } : { type: "QUICK_REPLY", text: b.text.trim() })),
    });
  }
  return components;
}

/** Reads Meta's components (from GET message_templates) back into our shape. */
export function fromMetaComponents(raw: unknown): TemplateContent {
  const list = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  const find = (type: string) => list.find((c) => String(c.type).toUpperCase() === type);
  const header = find("HEADER");
  const buttons = (find("BUTTONS")?.buttons as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    header: header ? { format: header.format === "IMAGE" ? "IMAGE" : header.format === "TEXT" ? "TEXT" : "NONE", text: typeof header.text === "string" ? header.text : undefined } : { format: "NONE" },
    body: String(find("BODY")?.text ?? ""),
    footer: typeof find("FOOTER")?.text === "string" ? String(find("FOOTER")!.text) : undefined,
    buttons: buttons
      .filter((b) => b.type === "URL" || b.type === "QUICK_REPLY")
      .map((b) => ({ type: b.type as "URL" | "QUICK_REPLY", text: String(b.text ?? ""), ...(b.type === "URL" ? { url: String(b.url ?? "") } : {}) })),
  };
}

/** Reads a stored components column, tolerating older or partial rows. */
export function readTemplateContent(raw: unknown): TemplateContent {
  if (Array.isArray(raw)) return fromMetaComponents(raw);
  const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const header = c.header && typeof c.header === "object" ? (c.header as Record<string, unknown>) : {};
  const format = header.format === "TEXT" || header.format === "IMAGE" ? header.format : "NONE";
  return {
    header: { format, ...(typeof header.text === "string" ? { text: header.text } : {}) },
    body: typeof c.body === "string" ? c.body : "",
    ...(typeof c.footer === "string" && c.footer ? { footer: c.footer } : {}),
    buttons: Array.isArray(c.buttons)
      ? (c.buttons as Array<Record<string, unknown>>)
          .filter((b) => b && (b.type === "URL" || b.type === "QUICK_REPLY"))
          .slice(0, 3)
          .map((b) => ({ type: b.type as "URL" | "QUICK_REPLY", text: String(b.text ?? "").slice(0, 25), ...(b.type === "URL" ? { url: String(b.url ?? "") } : {}) }))
      : [],
  };
}

export function readVariables(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((v) => (typeof v === "string" ? v : "")).slice(0, 20) : [];
}

export type VariableValues = Partial<Record<TemplateVariable, string>>;

/**
 * The values for {{1}}..{{n}}, in order. A missing value would make Meta reject the send, so empty values become
 * a safe fallback ("there" for a name, the shop link for links) and the caller is told which were missing.
 */
export function fillTemplateVariables(mapping: string[], count: number, values: VariableValues): { params: string[]; missing: TemplateVariable[] } {
  const params: string[] = [];
  const missing: TemplateVariable[] = [];
  for (let i = 0; i < count; i++) {
    const key = mapping[i] as TemplateVariable;
    let value = (key && values[key]?.trim()) || "";
    if (!value) {
      if (key) missing.push(key);
      value = key === "first_name" ? "there" : /link$/.test(key ?? "") ? values.link?.trim() || "-" : "-";
    }
    // Meta refuses parameters with newlines, tabs or more than four spaces in a row.
    params.push(value.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 1000));
  }
  return { params, missing };
}

/** The template message for POST /{PHONE_NUMBER_ID}/messages. */
export function templateMessage(input: { name: string; language: string; params: string[]; headerImageUrl?: string | null; urlButtons?: Array<{ index: number; text: string }> }) {
  const components: Array<Record<string, unknown>> = [];
  if (input.headerImageUrl) components.push({ type: "header", parameters: [{ type: "image", image: { link: input.headerImageUrl } }] });
  if (input.params.length) components.push({ type: "body", parameters: input.params.map((text) => ({ type: "text", text })) });
  for (const button of input.urlButtons ?? []) components.push({ type: "button", sub_type: "url", index: String(button.index), parameters: [{ type: "text", text: button.text }] });
  return { type: "template", template: { name: input.name, language: { code: input.language }, ...(components.length ? { components } : {}) } };
}

/** The message as the customer reads it, for previews and the inbox. */
export function renderTemplateText(content: TemplateContent, params: string[]) {
  const fill = (text: string) => text.replace(/{{\s*(\d+)\s*}}/g, (_, n: string) => params[Number(n) - 1] ?? `{{${n}}}`);
  return [content.header.format === "TEXT" ? content.header.text ?? "" : "", fill(content.body), content.footer ?? ""].filter((part) => part.trim()).join("\n\n");
}

// ─── Ready-made templates ─────────────────────────────────────────────────────

export interface TemplatePreset {
  key: "order_confirmation" | "order_shipped" | "order_delivered" | "abandoned_cart" | "back_in_stock" | "promo";
  title: string;
  description: string;
  name: string;
  category: TemplateCategory;
  content: TemplateContent;
  variables: TemplateVariable[];
}

const STOP_BUTTON: TemplateButton = { type: "QUICK_REPLY", text: "Stop promotions" };

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    key: "order_confirmation",
    title: "Order confirmed",
    description: "Sent when someone places an order.",
    name: "order_confirmation",
    category: "UTILITY",
    content: { header: { format: "TEXT", text: "Order confirmed" }, body: "Hi {{1}}, thank you for your order {{2}} at {{3}}. The total is {{4}}. We'll message you when it ships.", footer: "Reply here if you have a question", buttons: [] },
    variables: ["first_name", "order_number", "store_name", "order_total"],
  },
  {
    key: "order_shipped",
    title: "Order shipped",
    description: "Sent when you mark an order shipped, with its tracking.",
    name: "order_shipped",
    category: "UTILITY",
    content: { header: { format: "TEXT", text: "Your order is on its way" }, body: "Hi {{1}}, your order {{2}} from {{3}} has shipped. Tracking: {{4}}. Follow it here: {{5}} and reply if you need help.", buttons: [] },
    variables: ["first_name", "order_number", "store_name", "tracking_code", "tracking_link"],
  },
  {
    key: "order_delivered",
    title: "Order delivered",
    description: "Sent when an order is marked delivered.",
    name: "order_delivered",
    category: "UTILITY",
    content: { header: { format: "NONE" }, body: "Hi {{1}}, your order {{2}} from {{3}} has been delivered. We hope you love it. Reply here if anything isn't right.", buttons: [] },
    variables: ["first_name", "order_number", "store_name"],
  },
  {
    key: "abandoned_cart",
    title: "Cart reminder",
    description: "A reminder about the cart someone left at checkout.",
    name: "cart_reminder",
    category: "MARKETING",
    content: { header: { format: "NONE" }, body: "Hi {{1}}, you left {{2}} in your cart at {{3}}. It's saved for you here: {{4}} and you can reply with any questions.", footer: "Not interested? Tap Stop promotions", buttons: [STOP_BUTTON] },
    variables: ["first_name", "cart_items", "store_name", "cart_link"],
  },
  {
    key: "back_in_stock",
    title: "Back in stock",
    description: "Tell people a product they wanted is available again.",
    name: "back_in_stock",
    category: "MARKETING",
    content: { header: { format: "IMAGE" }, body: "Good news, {{1}}! {{2}} is back in stock at {{3}}. Get yours here: {{4}} before it sells out again.", footer: "Not interested? Tap Stop promotions", buttons: [STOP_BUTTON] },
    variables: ["first_name", "product_name", "store_name", "product_link"],
  },
  {
    key: "promo",
    title: "Promotion with a code",
    description: "A sale or offer with a discount code.",
    name: "store_promo",
    category: "MARKETING",
    content: { header: { format: "IMAGE" }, body: "Hi {{1}}, something special from {{2}}: use code {{3}} at checkout for money off your next order. Shop here: {{4}} while it lasts.", footer: "Not interested? Tap Stop promotions", buttons: [STOP_BUTTON] },
    variables: ["first_name", "store_name", "discount_code", "link"],
  },
];

export function presetTemplate(key: string) {
  return TEMPLATE_PRESETS.find((preset) => preset.key === key) ?? null;
}

/** Turns a free-text name into a valid Meta template name ("Order shipped!" → "order_shipped"). */
export function templateName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

// ─── Order messages (transactional) ───────────────────────────────────────────

export type CustomerEvent = "order_confirmed" | "payment_received" | "order_shipped" | "order_delivered" | "abandoned_cart";

export const CUSTOMER_EVENTS: Array<{ key: CustomerEvent; label: string; sub: string; preset: TemplatePreset["key"]; sms: string }> = [
  { key: "order_confirmed", label: "Order confirmed", sub: "Right after checkout", preset: "order_confirmation", sms: "{{store}}: thanks {{name}}! Order {{order_number}} ({{order_total}}) is confirmed. We'll text you when it ships." },
  { key: "payment_received", label: "Payment received", sub: "When payment is confirmed or you mark it paid", preset: "order_confirmation", sms: "{{store}}: payment received for order {{order_number}} ({{order_total}}). Thank you, {{name}}!" },
  { key: "order_shipped", label: "Shipped (with tracking)", sub: "When you mark the order shipped", preset: "order_shipped", sms: "{{store}}: order {{order_number}} is on its way. Tracking: {{tracking_code}} {{tracking_link}}" },
  { key: "order_delivered", label: "Delivered", sub: "When the order is marked delivered", preset: "order_delivered", sms: "{{store}}: order {{order_number}} has been delivered. Enjoy, {{name}}! Reply if anything isn't right." },
  { key: "abandoned_cart", label: "Abandoned cart", sub: "One reminder, an hour after someone leaves checkout with their phone", preset: "abandoned_cart", sms: "{{store}}: hi {{name}}, your cart is saved: {{cart_url}} Reply STOP to opt out." },
];

export interface CustomerEventSetting {
  whatsapp: boolean;
  sms: boolean;
  templateId: string | null;
  smsText: string;
}

export type TransactionalSettings = Record<CustomerEvent, CustomerEventSetting>;

export function readTransactional(raw: unknown): TransactionalSettings {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as TransactionalSettings;
  for (const event of CUSTOMER_EVENTS) {
    const s = obj[event.key] && typeof obj[event.key] === "object" ? (obj[event.key] as Record<string, unknown>) : {};
    out[event.key] = {
      whatsapp: s.whatsapp === true,
      sms: s.sms === true,
      templateId: typeof s.templateId === "string" && s.templateId ? s.templateId : null,
      smsText: typeof s.smsText === "string" && s.smsText.trim() ? s.smsText.slice(0, 480) : event.sms,
    };
  }
  return out;
}

/** "paid" / "shipped" / "delivered" order statuses (and our own event names) → the customer message event. */
export function customerEventFor(statusOrEvent: string): CustomerEvent | null {
  switch (statusOrEvent) {
    case "order_confirmed":
    case "order_placed":
    case "placed":
      return "order_confirmed";
    case "paid":
    case "payment_received":
      return "payment_received";
    case "shipped":
    case "order_shipped":
      return "order_shipped";
    case "delivered":
    case "order_delivered":
      return "order_delivered";
    case "abandoned_cart":
      return "abandoned_cart";
    default:
      return null;
  }
}

// ─── Automatic WhatsApp order messages ────────────────────────────────────────

/**
 * The ready-made utility templates a store gets on its own WhatsApp account as soon as it connects WhatsApp
 * (src/lib/marketing/order-messages-setup.server.ts), and the order events switched on to use them. Payment
 * received stays off: it would repeat the "Order confirmed" wording a minute after checkout.
 */
export const ORDER_MESSAGE_PRESETS = ["order_confirmation", "order_shipped", "order_delivered"] as const satisfies ReadonlyArray<TemplatePreset["key"]>;
export const ORDER_MESSAGE_EVENTS_ON: CustomerEvent[] = ["order_confirmed", "order_shipped", "order_delivered"];

export interface TemplateStatusUpdate {
  wabaId: string;
  metaId: string;
  name: string | null;
  language: string | null;
  status: string;
  reason: string | null;
}

/**
 * Meta's "message_template_status_update" webhook (field on the WhatsApp Business Account) → one update per
 * template: { entry: [{ id: WABA_ID, changes: [{ field, value: { event, message_template_id, … , reason } }] }] }.
 */
export function parseTemplateStatusUpdates(payload: unknown): TemplateStatusUpdate[] {
  const out: TemplateStatusUpdate[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries as Array<{ id?: unknown; changes?: unknown }>) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes as Array<{ field?: unknown; value?: Record<string, unknown> }>) {
      if (change?.field !== "message_template_status_update" || !change.value) continue;
      const v = change.value;
      const metaId = v.message_template_id == null ? "" : String(v.message_template_id);
      const status = typeof v.event === "string" ? v.event.toUpperCase() : "";
      if (!/^\d+$/.test(metaId) || !status) continue;
      out.push({
        wabaId: entry.id == null ? "" : String(entry.id),
        metaId,
        name: typeof v.message_template_name === "string" ? v.message_template_name : null,
        language: typeof v.message_template_language === "string" ? v.message_template_language : null,
        status,
        reason: typeof v.reason === "string" && v.reason && v.reason !== "NONE" ? v.reason : null,
      });
    }
  }
  return out;
}

// ─── Meta's Template Library (pre-approved utility templates) ─────────────────

/**
 * Meta's Template Library has fixed-wording utility templates that are approved the moment they're created
 * (POST /{WABA_ID}/message_templates with library_template_name). For each ready-made order template we look
 * for one of these first, under the matching use cases, and only submit our own wording when none fits.
 */
export const LIBRARY_USECASES: Record<(typeof ORDER_MESSAGE_PRESETS)[number], string[]> = {
  order_confirmation: ["ORDER_CONFIRMATION"],
  order_shipped: ["SHIPMENT_CONFIRMATION", "DELIVERY_UPDATE"],
  order_delivered: ["DELIVERY_CONFIRMATION"],
};

/** One entry of GET /message_template_library. */
export interface LibraryTemplate {
  name?: unknown;
  language?: unknown;
  header?: unknown;
  body?: unknown;
  body_params?: unknown;
  buttons?: unknown;
}

export interface LibraryPlan {
  libraryName: string;
  content: TemplateContent;
  variables: TemplateVariable[];
  /** library_template_button_inputs: our order page as the link of a URL button. */
  buttonInputs: Array<Record<string, unknown>>;
}

const MONEY = /[$€£₦¢]|\b(ngn|ghs|kes|usd|zar)\b|\d[\d,]*\.\d{2}\b/i;

/** What a library template's {{n}} is, from the words just before it (and its sample value); null when unsure. */
function libraryVariable(before: string, sample: string, isLastAtEnd: boolean): TemplateVariable | null {
  const b = before.toLowerCase().replace(/[\s:#*(\-–]+$/, "").trim();
  if (/\btracking (number|no\.?|code|id)( is)?$|\btracking$|\bwaybill( number| no\.?)?$/.test(b)) return "tracking_code";
  if (/\b(order|order number|order no\.?|order id|purchase|purchase number)$/.test(b) && !MONEY.test(sample)) return "order_number";
  if (/\b(total|amount|total of|amount of|for a total of|payment of|sum of)$/.test(b) || (MONEY.test(sample) && /\b(of|for|is|total)$/.test(b))) return "order_total";
  if (/(^|[\s,.!])(hi|hello|hey|dear|thanks|thank you)$/.test(b)) return "first_name";
  if (/\b(from|at|with|by|shopping with|shopping at|team at|the team at)$/.test(b) && !MONEY.test(sample)) return "store_name";
  // A sign-off: the business name closing the message ("… Thank you. {{4}}").
  if (isLastAtEnd && (b === "" || /[.!\n]$/.test(before.trimEnd()) || /\b(thanks|thank you|regards|cheers)[,.!]?$/.test(b))) return "store_name";
  return null;
}

/**
 * Turns a library template into what we create and later send, or null when any blank can't be filled with an
 * order detail we have, the header has blanks, or a button needs something we can't give (a phone number, a form).
 */
export function planLibraryTemplate(t: LibraryTemplate, orderPageBase: string): LibraryPlan | null {
  const libraryName = typeof t.name === "string" ? t.name : "";
  const body = typeof t.body === "string" ? t.body : "";
  if (!/^[a-z0-9_]+$/.test(libraryName) || !body.trim()) return null;
  const header = typeof t.header === "string" ? t.header.trim() : "";
  if (placeholders(header).length || header.length > 60) return null;
  const samples = Array.isArray(t.body_params) ? t.body_params.map((s) => String(s ?? "")) : [];

  const order = placeholders(body);
  const count = order.length ? Math.max(...order) : 0;
  if (count !== order.length) return null; // gaps
  const variables: TemplateVariable[] = [];
  for (let n = 1; n <= count; n++) {
    const token = new RegExp(`{{\\s*${n}\\s*}}`);
    const at = body.search(token);
    const prev = body.slice(0, at).replace(/^[\s\S]*}}/, "");
    const rest = body.slice(at).replace(token, "");
    const variable = libraryVariable(prev, samples[n - 1] ?? "", rest.trim() === "" || /^[\s.!]*$/.test(rest));
    if (!variable) return null;
    variables.push(variable);
  }

  const buttons: TemplateButton[] = [];
  const buttonInputs: Array<Record<string, unknown>> = [];
  const base = orderPageBase.replace(/\/+$/, "");
  if (!/^https:\/\/[^\s{}]+$/.test(base)) return null;
  for (const raw of Array.isArray(t.buttons) ? (t.buttons as Array<Record<string, unknown>>) : []) {
    const type = String(raw?.type ?? "").toUpperCase();
    const text = String(raw?.text ?? "").slice(0, 25);
    if (type === "QUICK_REPLY") {
      buttons.push({ type: "QUICK_REPLY", text });
    } else if (type === "URL") {
      // Our order page, with the order id as the end of the link: https://shop/order/{{1}}
      buttons.push({ type: "URL", text, url: `${base}/{{1}}` });
      buttonInputs.push({ type: "URL", url: { base_url: `${base}/{{1}}`, url_suffix_example: `${base}/1042` } });
    } else {
      return null;
    }
  }
  if (buttons.length > 3) return null;
  return { libraryName, content: { header: header ? { format: "TEXT", text: header } : { format: "NONE" }, body, buttons }, variables, buttonInputs };
}

/** The end of the order page link a URL button with {{1}} needs ("…/order/{{1}}" + order link → the order id). */
export function urlButtonSuffixes(content: TemplateContent, values: VariableValues): Array<{ index: number; text: string }> | null {
  const out: Array<{ index: number; text: string }> = [];
  for (const [index, button] of content.buttons.entries()) {
    if (button.type !== "URL" || !placeholders(button.url).length) continue;
    const base = (button.url ?? "").replace(/{{\s*1\s*}}.*$/, "");
    const link = values.order_link ?? "";
    if (!base || !link.startsWith(base) || link.length === base.length) return null;
    out.push({ index, text: link.slice(base.length) });
  }
  return out;
}
