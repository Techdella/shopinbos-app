import { htmlFromBlocks, type EmailBlock } from "./blocks.ts";

// Automation flows: trigger → wait → condition → action steps, stored on AutomationRule.actionConfig.steps.
// Pure (no server imports): step parsing, ready-made flows, and message variables. Unit-tested.

export type FlowTrigger =
  | "welcome_email"
  | "abandoned_checkout"
  | "browse_abandonment"
  | "order_placed"
  | "payment_received"
  | "order_shipped"
  | "order_delivered"
  | "post_purchase"
  | "review_request"
  | "win_back"
  | "birthday"
  | "new_customer";

export const TRIGGER_INFO: Record<FlowTrigger, { label: string; sub: string }> = {
  welcome_email: { label: "Someone subscribes", sub: "From a sign-up form, pop-up or checkout tick box" },
  abandoned_checkout: { label: "Cart left behind", sub: "A shopper gave their email or phone at checkout and didn't pay" },
  browse_abandonment: { label: "Saved but didn't buy", sub: "A known shopper saved products to their wishlist and hasn't ordered" },
  order_placed: { label: "Order placed", sub: "Any new order, paid or not" },
  payment_received: { label: "Order paid", sub: "Payment confirmed online or marked paid" },
  order_shipped: { label: "Order shipped", sub: "You mark an order shipped" },
  order_delivered: { label: "Order delivered", sub: "You or the rider mark an order delivered" },
  post_purchase: { label: "After a purchase", sub: "Order paid (same moment as Order paid)" },
  review_request: { label: "Order delivered (review)", sub: "Same moment as Order delivered" },
  win_back: { label: "Customer gone quiet", sub: "No order for a number of days after their last one" },
  birthday: { label: "Birthday", sub: "On the birthday a subscriber gave you" },
  new_customer: { label: "First order", sub: "Someone orders for the first time" },
};

export type FlowCondition =
  | "not_ordered_since_start"
  | "ordered_since_start"
  | "cart_not_recovered"
  | "subscribed"
  | "in_segment"
  | "has_email"
  | "has_phone";

export const CONDITION_LABEL: Record<FlowCondition, string> = {
  not_ordered_since_start: "Hasn't ordered since the flow started",
  ordered_since_start: "Has ordered since the flow started",
  cart_not_recovered: "Cart still not paid for",
  subscribed: "Still subscribed",
  in_segment: "Is in a segment",
  has_email: "Has an email address",
  has_phone: "Has a phone number",
};

export type FlowStep =
  | { type: "wait"; minutes: number }
  | { type: "condition"; check: FlowCondition; segmentId?: string | null }
  | { type: "send_email"; subject: string; bodyHtml: string; templateId?: string | null }
  | { type: "send_sms"; message: string }
  /**
   * WhatsApp: an approved template (`template` is a WhatsAppTemplate id, or "preset:<key>" for the store's approved
   * template made from a ready-made one) with {{1}}..{{n}} filled from `variables`; or, without a template, a
   * free-form `message`, which WhatsApp only delivers within 24 hours of the customer's last message.
   */
  | { type: "send_whatsapp"; message: string; template?: string | null; variables?: string[]; headerImageUrl?: string | null }
  | { type: "add_tag"; tag: string }
  | { type: "give_discount"; percent: number; days: number }
  | { type: "request_review" }
  | { type: "notify_seller"; message: string };

export type FlowStepType = FlowStep["type"];

export const STEP_LABEL: Record<FlowStepType, string> = {
  wait: "Wait",
  condition: "Only continue if",
  send_email: "Send email",
  send_sms: "Send SMS",
  send_whatsapp: "Send WhatsApp",
  add_tag: "Add tag",
  give_discount: "Make a one-time discount code",
  request_review: "Ask for a review",
  notify_seller: "Notify me",
};

export interface FlowSettings {
  /** win_back: days since the last order. */
  days?: number;
}

export interface FlowConfig {
  steps: FlowStep[];
  settings: FlowSettings;
}

const MAX_STEPS = 20;
const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const CONDITIONS = Object.keys(CONDITION_LABEL) as FlowCondition[];

export function parseStep(raw: unknown): FlowStep | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  switch (s.type) {
    case "wait": {
      const minutes = Math.round(Number(s.minutes));
      return Number.isFinite(minutes) && minutes > 0 ? { type: "wait", minutes: Math.min(minutes, 60 * 24 * 365) } : null;
    }
    case "condition":
      return CONDITIONS.includes(s.check as FlowCondition)
        ? { type: "condition", check: s.check as FlowCondition, segmentId: typeof s.segmentId === "string" ? s.segmentId : null }
        : null;
    case "send_email": {
      const subject = str(s.subject, 200).trim();
      const bodyHtml = str(s.bodyHtml, 100_000);
      const templateId = typeof s.templateId === "string" && s.templateId ? s.templateId : null;
      return subject || templateId ? { type: "send_email", subject, bodyHtml, templateId } : null;
    }
    case "send_sms": {
      const message = str(s.message, 1000).trim();
      return message ? { type: "send_sms", message } : null;
    }
    case "send_whatsapp": {
      const message = str(s.message, 1000).trim();
      const template = typeof s.template === "string" && s.template.trim() ? s.template.trim().slice(0, 80) : null;
      if (!message && !template) return null;
      const variables = Array.isArray(s.variables) ? s.variables.map((v) => (typeof v === "string" ? v.slice(0, 40) : "")).slice(0, 20) : [];
      const headerImageUrl = typeof s.headerImageUrl === "string" && /^https:\/\/\S+$/.test(s.headerImageUrl) ? s.headerImageUrl.slice(0, 1000) : null;
      return { type: "send_whatsapp", message, ...(template ? { template, variables, ...(headerImageUrl ? { headerImageUrl } : {}) } : {}) };
    }
    case "add_tag": {
      const tag = str(s.tag, 40).trim().toLowerCase();
      return tag ? { type: "add_tag", tag } : null;
    }
    case "give_discount": {
      const percent = Math.round(Number(s.percent));
      const days = Math.round(Number(s.days));
      return percent > 0 && percent <= 90 ? { type: "give_discount", percent, days: days > 0 ? Math.min(days, 365) : 7 } : null;
    }
    case "request_review":
      return { type: "request_review" };
    case "notify_seller": {
      const message = str(s.message, 500).trim();
      return { type: "notify_seller", message: message || "{{name}} reached this step." };
    }
    default:
      return null;
  }
}

/**
 * Reads AutomationRule.actionConfig. Rules saved before flows existed ({ templateId, subject, body } with an
 * actionType and delayMinutes on the rule) become a one- or two-step flow so they keep working.
 */
export function parseFlowConfig(actionConfig: unknown, legacy?: { actionType?: string; delayMinutes?: number }): FlowConfig {
  const cfg = actionConfig && typeof actionConfig === "object" && !Array.isArray(actionConfig) ? (actionConfig as Record<string, unknown>) : {};
  const settingsRaw = cfg.settings && typeof cfg.settings === "object" ? (cfg.settings as Record<string, unknown>) : {};
  const settings: FlowSettings = Number(settingsRaw.days) > 0 ? { days: Math.min(Math.round(Number(settingsRaw.days)), 3650) } : {};
  if (Array.isArray(cfg.steps)) {
    return { steps: cfg.steps.map(parseStep).filter((step): step is FlowStep => Boolean(step)).slice(0, MAX_STEPS), settings };
  }
  const steps: FlowStep[] = [];
  if (legacy?.delayMinutes && legacy.delayMinutes > 0) steps.push({ type: "wait", minutes: legacy.delayMinutes });
  const subject = str(cfg.subject, 200);
  const body = str(cfg.body, 100_000);
  const templateId = typeof cfg.templateId === "string" && cfg.templateId ? cfg.templateId : null;
  const actionType = legacy?.actionType ?? "send_email";
  if (actionType === "send_email" && (subject || templateId)) steps.push({ type: "send_email", subject, bodyHtml: body, templateId });
  else if (actionType === "send_notification") steps.push({ type: "notify_seller", message: subject || body || "An automation ran." });
  return { steps, settings };
}

/** Sends in a flow (for "3 emails, 1 WhatsApp"). */
export function countMessages(steps: FlowStep[]) {
  return steps.filter((step) => step.type === "send_email" || step.type === "send_sms" || step.type === "send_whatsapp" || step.type === "request_review").length;
}

export function describeStep(step: FlowStep): string {
  switch (step.type) {
    case "wait":
      return `Wait ${formatMinutes(step.minutes)}`;
    case "condition":
      return `Only continue if: ${CONDITION_LABEL[step.check].toLowerCase()}`;
    case "send_email":
      return `Email: ${step.subject || "from template"}`;
    case "send_sms":
      return `SMS: ${step.message.slice(0, 60)}`;
    case "send_whatsapp":
      return step.template ? `WhatsApp template${step.template.startsWith("preset:") ? ` (${step.template.slice(7).replace(/_/g, " ")})` : ""}` : `WhatsApp: ${step.message.slice(0, 60)}`;
    case "add_tag":
      return `Tag them "${step.tag}"`;
    case "give_discount":
      return `Make a ${step.percent}% code, valid ${step.days} days`;
    case "request_review":
      return "Ask them to review what they bought";
    case "notify_seller":
      return "Notify me";
  }
}

export function formatMinutes(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * What's wrong with a step before the flow can be switched on, in the seller's words. `templates` are the store's
 * WhatsApp templates (id, status, how many variables) when known; "preset:" references are checked at send time.
 */
export function stepProblems(step: FlowStep, context: { templates?: Array<{ id: string; status: string; variableCount: number }>; whatsappTemplates?: boolean } = {}): string[] {
  const problems: string[] = [];
  switch (step.type) {
    case "send_sms":
      if (!step.message.trim()) problems.push("Write the SMS.");
      if (step.message.length > 480) problems.push("Keep the SMS under 480 characters (3 parts).");
      break;
    case "send_whatsapp": {
      if (!step.template) {
        if (!step.message.trim()) problems.push("Pick a WhatsApp template or write a message.");
        break;
      }
      if (context.whatsappTemplates === false) problems.push("Connect WhatsApp (Inbox › Chatbot › WhatsApp) to send templates.");
      if (step.template.startsWith("preset:")) break;
      const template = context.templates?.find((t) => t.id === step.template);
      if (context.templates && !template) problems.push("The WhatsApp template was deleted. Pick another one.");
      else if (template && template.status !== "APPROVED") problems.push(`The WhatsApp template isn't approved yet (${template.status.toLowerCase()}).`);
      if (template) for (let i = 0; i < template.variableCount; i++) if (!step.variables?.[i]) problems.push(`Choose what {{${i + 1}}} is filled with.`);
      break;
    }
    case "send_email":
      if (!step.subject.trim() && !step.templateId) problems.push("Give the email a subject or pick a template.");
      break;
    case "condition":
      if (step.check === "in_segment" && !step.segmentId) problems.push("Choose the segment.");
      break;
    case "add_tag":
      if (!step.tag.trim()) problems.push("Name the tag.");
      break;
    default:
      break;
  }
  return [...new Set(problems)];
}

/** Things that won't stop a flow from running but will make messages go missing. */
export function stepWarnings(step: FlowStep): string[] {
  if (step.type === "send_whatsapp" && !step.template) return ["Without a template, WhatsApp only delivers this to people who messaged you in the last 24 hours. Pick an approved template."];
  return [];
}

// ─── Message variables ────────────────────────────────────────────────────────

export const FLOW_VARIABLES = [
  ["name", "Their first name (or “there”)"],
  ["full_name", "Their full name"],
  ["store", "Your shop name"],
  ["store_url", "Link to your shop"],
  ["cart_url", "Link that brings their cart back"],
  ["cart_items", "What's in their cart"],
  ["cart_total", "Cart total"],
  ["order_number", "Order number"],
  ["order_total", "Order total"],
  ["product_name", "Product they saved or bought"],
  ["discount_code", "Code made by a discount step"],
  ["unsubscribe_url", "Unsubscribe link (emails get one in the footer anyway)"],
] as const;

export type FlowVariables = Partial<Record<(typeof FLOW_VARIABLES)[number][0] | "currency" | "brand_accent", string>>;

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Replaces {{variable}} placeholders. In HTML mode values are escaped; unknown variables become "". */
export function fillVariables(text: string, vars: FlowVariables, mode: "html" | "text" = "text") {
  return text.replace(/{{\s*([a-z_]+)\s*}}/g, (_, key: string) => {
    const value = vars[key as keyof FlowVariables] ?? (key === "name" ? "there" : "");
    return mode === "html" ? value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]) : value;
  });
}

export function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

// ─── Ready-made flows ─────────────────────────────────────────────────────────

const t = (text: string): EmailBlock => ({ type: "text", text });
const button = (label: string, url: string): EmailBlock => ({ type: "button", label, url });
const email = (...blocks: EmailBlock[]) => htmlFromBlocks(blocks);

export interface FlowPreset {
  key: string;
  name: string;
  description: string;
  trigger: FlowTrigger;
  settings?: FlowSettings;
  steps: FlowStep[];
}

export const FLOW_PRESETS: FlowPreset[] = [
  {
    key: "welcome",
    name: "Welcome series",
    description: "Say hello the moment someone subscribes, then show them your best sellers two days later.",
    trigger: "welcome_email",
    steps: [
      { type: "send_email", subject: "Welcome to {{store}}", bodyHtml: email(t("Hi {{name}},"), t("Thanks for joining {{store}}. You'll be the first to hear about new arrivals and offers."), button("Visit the shop", "{{store_url}}")) },
      { type: "wait", minutes: 2 * 1440 },
      { type: "condition", check: "not_ordered_since_start" },
      { type: "send_email", subject: "Our customers' favourites at {{store}}", bodyHtml: email(t("Hi {{name}},"), t("Not sure where to start? These are the pieces people keep coming back for."), button("See what's popular", "{{store_url}}")) },
    ],
  },
  {
    key: "abandoned_cart",
    name: "Abandoned cart",
    description: "Remind shoppers about the cart they left, with a link that brings it back, then a small nudge a day later.",
    trigger: "abandoned_checkout",
    steps: [
      { type: "wait", minutes: 60 },
      { type: "condition", check: "cart_not_recovered" },
      { type: "send_email", subject: "You left something at {{store}}", bodyHtml: email(t("Hi {{name}},"), t("Your cart is saved: {{cart_items}}."), t("**Total: {{cart_total}}**"), button("Finish your order", "{{cart_url}}")) },
      { type: "wait", minutes: 1440 },
      { type: "condition", check: "cart_not_recovered" },
      { type: "give_discount", percent: 10, days: 3 },
      { type: "send_email", subject: "10% off your cart at {{store}}", bodyHtml: email(t("Hi {{name}},"), t("Still thinking it over? Use code **{{discount_code}}** for 10% off. It's yours for the next 3 days."), button("Go back to your cart", "{{cart_url}}")) },
    ],
  },
  {
    key: "abandoned_cart_whatsapp",
    name: "Abandoned cart: WhatsApp first",
    description: "A WhatsApp reminder an hour after someone leaves checkout, then an email a day later if they still haven't paid.",
    trigger: "abandoned_checkout",
    steps: [
      { type: "wait", minutes: 60 },
      { type: "condition", check: "cart_not_recovered" },
      { type: "condition", check: "has_phone" },
      { type: "send_whatsapp", message: "", template: "preset:abandoned_cart", variables: ["first_name", "cart_items", "store_name", "cart_link"] },
      { type: "wait", minutes: 23 * 60 },
      { type: "condition", check: "cart_not_recovered" },
      { type: "send_email", subject: "Your cart at {{store}} is still saved", bodyHtml: email(t("Hi {{name}},"), t("Your cart is still waiting: {{cart_items}}. Items sell out, so finish your order while they are here."), button("Finish your order", "{{cart_url}}")) },
    ],
  },
  {
    key: "order_updates_whatsapp",
    name: "Shipping update on WhatsApp",
    description: "Tell buyers on WhatsApp the moment you mark their order shipped, with the tracking code.",
    trigger: "order_shipped",
    steps: [
      { type: "condition", check: "has_phone" },
      { type: "send_whatsapp", message: "", template: "preset:order_shipped", variables: ["first_name", "order_number", "store_name", "tracking_code", "tracking_link"] },
    ],
  },
  {
    key: "browse",
    name: "Saved but didn't buy",
    description: "When a known shopper saves products and doesn't order within a day, show them what they liked.",
    trigger: "browse_abandonment",
    steps: [
      { type: "condition", check: "not_ordered_since_start" },
      { type: "send_email", subject: "Still thinking about {{product_name}}?", bodyHtml: email(t("Hi {{name}},"), t("You saved **{{product_name}}** at {{store}}. It's still here, but stock moves fast."), button("Take another look", "{{store_url}}")) },
    ],
  },
  {
    key: "thank_you",
    name: "Thank-you after purchase",
    description: "Thank buyers as soon as their payment is confirmed.",
    trigger: "payment_received",
    steps: [
      { type: "send_email", subject: "Thank you for your order, {{name}}", bodyHtml: email(t("Hi {{name}},"), t("Thank you for shopping with {{store}}. We've received payment for order {{order_number}} ({{order_total}}) and we're getting it ready."), t("Reply to this email if you need anything.")) },
    ],
  },
  {
    key: "review",
    name: "Review request",
    description: "Three days after delivery, ask buyers to rate what they bought.",
    trigger: "order_delivered",
    steps: [
      { type: "wait", minutes: 3 * 1440 },
      { type: "request_review" },
    ],
  },
  {
    key: "win_back",
    name: "Win-back",
    description: "When a customer hasn't ordered in 90 days, send a we-miss-you code.",
    trigger: "win_back",
    settings: { days: 90 },
    steps: [
      { type: "condition", check: "subscribed" },
      { type: "give_discount", percent: 15, days: 7 },
      { type: "send_email", subject: "We miss you at {{store}}", bodyHtml: email(t("Hi {{name}},"), t("It's been a while. Here's 15% off your next order with code **{{discount_code}}**, valid for 7 days."), button("Shop now", "{{store_url}}")) },
    ],
  },
  {
    key: "win_back_whatsapp",
    name: "Win-back on WhatsApp",
    description: "When a customer who said yes to WhatsApp hasn't ordered in 90 days, send a code on WhatsApp.",
    trigger: "win_back",
    settings: { days: 90 },
    steps: [
      { type: "condition", check: "has_phone" },
      { type: "give_discount", percent: 15, days: 7 },
      { type: "send_whatsapp", message: "", template: "preset:promo", variables: ["first_name", "store_name", "discount_code", "link"] },
    ],
  },
  {
    key: "birthday",
    name: "Birthday treat",
    description: "On a subscriber's birthday, send a gift code.",
    trigger: "birthday",
    steps: [
      { type: "give_discount", percent: 20, days: 7 },
      { type: "send_email", subject: "Happy birthday, {{name}}!", bodyHtml: email(t("Happy birthday from all of us at {{store}}!"), t("Here's 20% off as a gift: **{{discount_code}}**. It's valid for the next 7 days."), button("Treat yourself", "{{store_url}}")) },
    ],
  },
];

export function presetByKey(key: string) {
  return FLOW_PRESETS.find((preset) => preset.key === key) ?? null;
}
