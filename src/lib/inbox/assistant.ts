// Auto-replies and the storefront chatbot, the pure parts: the settings shapes with safe defaults, business
// hours in Lagos time, keyword quick replies, "I want a person" detection, and the one function that decides
// which automatic reply (if any) a new customer message gets. No server imports; unit-tested in
// tests/email-builder.test.mjs. The server side is maybeAutoReply in ./service.ts and ./chatbot.server.ts.

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export interface DayHours {
  open: boolean;
  /** "09:00", Lagos time. */
  from: string;
  to: string;
}

export interface KeywordReply {
  id: string;
  /** Words or short phrases, any of which triggers the reply ("price", "how much"). */
  keywords: string[];
  reply: string;
}

export interface AutoReplyRules {
  hours: { enabled: boolean; days: Record<Weekday, DayHours> };
  /** Channel key → false to never auto-reply there. Missing means on. */
  channels: Record<string, boolean>;
  keywordsEnabled: boolean;
  keywords: KeywordReply[];
  /** Instant "Thanks, we got your message" while you're open. */
  ack: { enabled: boolean; message: string };
  /** Add "We're back Monday at 9:00" to the away message outside business hours. */
  mentionHours: boolean;
}

export type ChatbotTone = "friendly" | "professional" | "playful";

export interface ChatbotSettings {
  enabled: boolean;
  /** Name shown in the chat ("Peggy"). */
  name: string;
  greeting: string;
  tone: ChatbotTone;
  /** What she may use to answer. */
  sources: { products: boolean; delivery: boolean; policies: boolean; faqs: boolean };
  faqs: Array<{ q: string; a: string }>;
  handoff: { keywords: string[]; message: string };
  /** Always, or only outside business hours (or while you're away when hours are off). */
  when: "always" | "outside_hours";
  /** Peggy on the seller's WhatsApp Business number (separate switch; name, tone, FAQs and sources are shared). */
  whatsapp: WhatsAppBotSettings;
}

export interface WhatsAppBotSettings {
  /** off; test = only answers the seller's own number; live = answers every customer. */
  mode: "off" | "test" | "live";
  /** The seller's own WhatsApp number for test mode and test messages ("+2348012345678"). */
  testNumber: string;
  /** "What do you sell?" gets a WhatsApp list of products with prices. */
  productList: boolean;
  /**
   * After a shopper picks a product: off, send the store link to buy, collect the order for the seller, or the
   * WhatsApp store (an in-chat cart and one checkout link for everything in it; src/lib/whatsapp-store).
   */
  ordering: "off" | "link" | "collect" | "cart";
  /** "Where is my order?" looks up orders placed with the same WhatsApp number. */
  orderStatus: boolean;
  /** First-message greeting on WhatsApp; empty uses the chatbot greeting. */
  greeting: string;
  when: "always" | "outside_hours";
  /** Peggy stays quiet on a chat for this long after the seller replies by hand. */
  quietMinutes: number;
  /** Orders placed from a WhatsApp chat get their confirmation (placed, then paid) back in that chat. */
  confirmations: boolean;
}

export const DEFAULT_AWAY_MESSAGE = "Thanks for your message! We're away right now and will reply as soon as we're back.";
export const DEFAULT_ACK_MESSAGE = "Thanks, we got your message! Someone from the shop will reply shortly.";
export const DEFAULT_HANDOFF_MESSAGE = "No problem, I've asked someone from the shop to reply to you here. If you leave, they'll get back to you by email or text.";

const weekday = (open: boolean): DayHours => ({ open, from: "09:00", to: "18:00" });

export const DEFAULT_AUTO_REPLY: AutoReplyRules = {
  hours: { enabled: false, days: { mon: weekday(true), tue: weekday(true), wed: weekday(true), thu: weekday(true), fri: weekday(true), sat: { open: true, from: "10:00", to: "16:00" }, sun: weekday(false) } },
  channels: {},
  keywordsEnabled: false,
  keywords: [],
  ack: { enabled: false, message: DEFAULT_ACK_MESSAGE },
  mentionHours: true,
};

export const DEFAULT_CHATBOT: ChatbotSettings = {
  enabled: false,
  name: "Peggy",
  greeting: "Hi! I'm Peggy, the shop's assistant. Ask me about products, prices or delivery.",
  tone: "friendly",
  sources: { products: true, delivery: true, policies: true, faqs: true },
  faqs: [],
  handoff: { keywords: [], message: DEFAULT_HANDOFF_MESSAGE },
  when: "always",
  whatsapp: { mode: "off", testNumber: "", productList: true, ordering: "link", orderStatus: true, greeting: "", when: "always", quietMinutes: 30, confirmations: true },
};

/** Ready-made keyword replies the settings page offers ("price", "delivery", "account number"). */
export const KEYWORD_SUGGESTIONS: Array<Omit<KeywordReply, "id">> = [
  { keywords: ["price", "how much", "hm", "cost"], reply: "Prices are on each product in our store. Tell us which item you like and we'll confirm the price and if it's available." },
  { keywords: ["delivery", "deliver", "shipping", "waybill"], reply: "We deliver! Tell us your area and we'll confirm the delivery fee and how long it takes." },
  { keywords: ["account number", "bank details", "transfer", "pay"], reply: "Thanks for choosing us! We'll send our payment details shortly. Please send your proof of payment here after you pay." },
  { keywords: ["available", "in stock", "do you have"], reply: "Let us check for you. Which item, size or colour are you looking for?" },
];

// ─── Reading settings ────────────────────────────────────────────────────────

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const text = (value: unknown, fallback: string, max: number) => (typeof value === "string" ? value.slice(0, max) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const time = (value: unknown, fallback: string) => (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback);

export function cleanKeywords(value: unknown, max = 12): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const out: string[] = [];
  for (const raw of list) {
    const word = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (word && !out.includes(word)) out.push(word);
    if (out.length >= max) break;
  }
  return out;
}

export function normaliseAutoReply(raw: unknown): AutoReplyRules {
  const r = rec(raw);
  const hours = rec(r.hours);
  const days = rec(hours.days);
  const channels: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(rec(r.channels))) if (typeof value === "boolean" && /^[a-z]{2,20}$/.test(key)) channels[key] = value;
  const ack = rec(r.ack);
  return {
    hours: {
      enabled: bool(hours.enabled, false),
      days: Object.fromEntries(
        WEEKDAYS.map((day) => {
          const d = rec(days[day]);
          const fallback = DEFAULT_AUTO_REPLY.hours.days[day];
          return [day, { open: bool(d.open, fallback.open), from: time(d.from, fallback.from), to: time(d.to, fallback.to) }];
        }),
      ) as Record<Weekday, DayHours>,
    },
    channels,
    keywordsEnabled: bool(r.keywordsEnabled, false),
    keywords: (Array.isArray(r.keywords) ? r.keywords : [])
      .slice(0, 30)
      .map((item, index) => {
        const k = rec(item);
        return { id: text(k.id, "", 40).replace(/[^\w-]/g, "") || `k${index + 1}`, keywords: cleanKeywords(k.keywords), reply: text(k.reply, "", 1000).trim() };
      })
      .filter((k) => k.keywords.length && k.reply),
    ack: { enabled: bool(ack.enabled, false), message: text(ack.message, DEFAULT_ACK_MESSAGE, 600).trim() || DEFAULT_ACK_MESSAGE },
    mentionHours: bool(r.mentionHours, true),
  };
}

export function normaliseChatbot(raw: unknown): ChatbotSettings {
  const c = rec(raw);
  const sources = rec(c.sources);
  const handoff = rec(c.handoff);
  return {
    enabled: bool(c.enabled, false),
    name: text(c.name, DEFAULT_CHATBOT.name, 40).trim() || DEFAULT_CHATBOT.name,
    greeting: text(c.greeting, DEFAULT_CHATBOT.greeting, 300).trim() || DEFAULT_CHATBOT.greeting,
    tone: c.tone === "professional" || c.tone === "playful" ? c.tone : "friendly",
    sources: {
      products: bool(sources.products, true),
      delivery: bool(sources.delivery, true),
      policies: bool(sources.policies, true),
      faqs: bool(sources.faqs, true),
    },
    faqs: (Array.isArray(c.faqs) ? c.faqs : [])
      .slice(0, 30)
      .map((item) => ({ q: text(rec(item).q, "", 200).trim(), a: text(rec(item).a, "", 1000).trim() }))
      .filter((faq) => faq.q && faq.a),
    handoff: { keywords: cleanKeywords(handoff.keywords), message: text(handoff.message, DEFAULT_HANDOFF_MESSAGE, 400).trim() || DEFAULT_HANDOFF_MESSAGE },
    when: c.when === "outside_hours" ? "outside_hours" : "always",
    whatsapp: normaliseWhatsAppBot(c.whatsapp),
  };
}

export function normaliseWhatsAppBot(raw: unknown): WhatsAppBotSettings {
  const w = rec(raw);
  const d = DEFAULT_CHATBOT.whatsapp;
  const quiet = Number(w.quietMinutes);
  const phone = text(w.testNumber, "", 30).replace(/[^\d+]/g, "");
  return {
    mode: w.mode === "test" || w.mode === "live" ? w.mode : "off",
    testNumber: /^\+?\d{7,15}$/.test(phone) ? (phone.startsWith("+") ? phone : `+${phone}`) : "",
    productList: bool(w.productList, d.productList),
    ordering: w.ordering === "off" || w.ordering === "collect" || w.ordering === "cart" ? w.ordering : "link",
    orderStatus: bool(w.orderStatus, d.orderStatus),
    greeting: text(w.greeting, "", 300).trim(),
    when: w.when === "outside_hours" ? "outside_hours" : "always",
    quietMinutes: Number.isFinite(quiet) ? Math.min(240, Math.max(5, Math.round(quiet))) : d.quietMinutes,
    confirmations: bool(w.confirmations, d.confirmations),
  };
}

// ─── Business hours (Africa/Lagos) ───────────────────────────────────────────

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Day of the week and minutes since midnight in Lagos. */
export function lagosClock(now = new Date()): { day: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase() as Weekday;
  return { day: WEEKDAYS.includes(day) ? day : "mon", minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function openOn(hours: DayHours, at: number) {
  if (!hours.open) return false;
  const from = minutes(hours.from);
  const to = minutes(hours.to);
  if (from === to) return true; // open all day
  return to > from ? at >= from && at < to : at >= from || at < to; // past midnight, e.g. 18:00-02:00
}

/** Whether the shop is open now. Always true when business hours are switched off. */
export function isOpenNow(hours: AutoReplyRules["hours"], now = new Date()) {
  if (!hours.enabled) return true;
  const clock = lagosClock(now);
  if (openOn(hours.days[clock.day], clock.minutes)) return true;
  // The tail of yesterday's late opening ("Friday 18:00-02:00" covers Saturday 01:00).
  const yesterday = hours.days[WEEKDAYS[(WEEKDAYS.indexOf(clock.day) + 6) % 7]];
  return yesterday.open && minutes(yesterday.to) < minutes(yesterday.from) && clock.minutes < minutes(yesterday.to);
}

const clockText = (hhmm: string) => {
  const [h, m] = [Number(hhmm.slice(0, 2)), hhmm.slice(3, 5)];
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`;
};

/** "later today at 9am", "tomorrow at 9am", "on Monday at 10am", or null when no day is open. */
export function nextOpening(hours: AutoReplyRules["hours"], now = new Date()): string | null {
  if (!hours.enabled) return null;
  const clock = lagosClock(now);
  const start = WEEKDAYS.indexOf(clock.day);
  for (let offset = 0; offset < 8; offset++) {
    const day = WEEKDAYS[(start + offset) % 7];
    const h = hours.days[day];
    if (!h.open || (offset === 0 && minutes(h.from) <= clock.minutes)) continue;
    const when = offset === 0 ? "later today" : offset === 1 ? "tomorrow" : `on ${WEEKDAY_LABELS[day]}`;
    return `${when} at ${clockText(h.from)}`;
  }
  return null;
}

/** "Mon-Fri 9am-6pm, Sat 10am-4pm" for the chatbot and the settings summary. */
export function describeHours(hours: AutoReplyRules["hours"]) {
  if (!hours.enabled) return "No set hours";
  const groups: Array<{ days: Weekday[]; label: string }> = [];
  for (const day of WEEKDAYS) {
    const h = hours.days[day];
    const label = h.open ? `${clockText(h.from)}-${clockText(h.to)}` : "closed";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.days.push(day);
    else groups.push({ days: [day], label });
  }
  const name = (day: Weekday) => WEEKDAY_LABELS[day].slice(0, 3);
  return groups
    .filter((group) => group.label !== "closed")
    .map((group) => `${group.days.length > 1 ? `${name(group.days[0])}-${name(group.days[group.days.length - 1])}` : name(group.days[0])} ${group.label}`)
    .join(", ") || "Closed every day";
}

// ─── Matching messages ───────────────────────────────────────────────────────

const flat = (value: string) => ` ${value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** The first keyword reply whose word or phrase appears in the message (whole words, any case). */
export function matchKeywordReply(rules: Pick<AutoReplyRules, "keywords">, message: string): KeywordReply | null {
  const haystack = flat(message);
  for (const rule of rules.keywords) {
    if (rule.keywords.some((word) => flat(word).trim() && haystack.includes(flat(word)))) return rule;
  }
  return null;
}

const HUMAN_PHRASES = ["talk to a person", "talk to someone", "speak to someone", "speak to a person", "real person", "human", "customer care", "customer service", "an agent", "your manager", "the owner", "call me", "talk to the owner"];

/** The shopper is asking for a person (default phrases plus the seller's own). */
export function wantsHuman(message: string, extra: string[] = []) {
  const haystack = flat(message);
  return [...HUMAN_PHRASES, ...extra].some((phrase) => flat(phrase).trim() && haystack.includes(flat(phrase)));
}

// ─── The decision ────────────────────────────────────────────────────────────

/** One away / "got it" reply per conversation every 12 hours. */
export const AUTO_REPLY_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type AutoReplyDecision =
  | { kind: "chatbot" }
  | { kind: "keyword"; ruleId: string; body: string }
  | { kind: "away"; body: string; peggy: boolean }
  | { kind: "ack"; body: string }
  | null;

export interface AutoReplyInput {
  /** InboxSettings: the master switch, "message" or "peggy", and the away text. */
  enabled: boolean;
  mode: "message" | "peggy";
  awayMessage: string | null;
  rules: AutoReplyRules;
  channel: string;
  /** The channel can send replies at all (and a form left an email). */
  channelReplies: boolean;
  message: string;
  sellerOnline: boolean;
  lastAutoReplyAt: Date | string | null | undefined;
  /** The chatbot should answer this one (live chat, switched on, in its hours, AI available, not handed off). */
  chatbot: boolean;
  /** Keyword replies already sent in this conversation in the last 12 hours. */
  recentKeywordIds?: string[];
  now?: Date;
}

/**
 * Which automatic reply a new customer message gets: the chatbot (live chat), a keyword quick reply, the away
 * message (outside business hours, or while the seller is away when hours are off) or the instant "got it",
 * at most once per conversation every 12 hours for away/got-it. Null for nothing.
 */
export function decideAutoReply(input: AutoReplyInput): AutoReplyDecision {
  const now = input.now ?? new Date();
  if (!input.channelReplies || input.rules.channels[input.channel] === false) return null;
  if (input.chatbot) return { kind: "chatbot" };
  if (!input.enabled) return null;

  if (input.rules.keywordsEnabled) {
    const rule = matchKeywordReply(input.rules, input.message);
    if (rule && !(input.recentKeywordIds ?? []).includes(rule.id)) return { kind: "keyword", ruleId: rule.id, body: rule.reply };
  }

  if (input.lastAutoReplyAt && now.getTime() - new Date(input.lastAutoReplyAt).getTime() < AUTO_REPLY_COOLDOWN_MS) return null;
  const outsideHours = input.rules.hours.enabled && !isOpenNow(input.rules.hours, now);
  if (outsideHours || (!input.rules.hours.enabled && !input.sellerOnline)) {
    const base = input.awayMessage?.trim() || DEFAULT_AWAY_MESSAGE;
    const back = outsideHours && input.rules.mentionHours ? nextOpening(input.rules.hours, now) : null;
    return { kind: "away", body: back ? `${base} We're back ${back}.` : base, peggy: input.mode === "peggy" };
  }
  if (input.rules.ack.enabled) return { kind: "ack", body: input.rules.ack.message };
  return null;
}

/** Whether the chatbot is in its working hours (it always is when set to "always"). */
export function chatbotOnDuty(bot: Pick<ChatbotSettings, "enabled" | "when">, rules: Pick<AutoReplyRules, "hours">, sellerOnline: boolean, now = new Date()) {
  if (!bot.enabled) return false;
  if (bot.when === "always") return true;
  return rules.hours.enabled ? !isOpenNow(rules.hours, now) : !sellerOnline;
}
