// Peggy in the admin inbox: which channel a reply goes on, how it should read there, and when she may answer by
// herself. Pure, unit-tested in tests/admin-team.test.mjs.

export const PEGGY_AUTO_CHANNELS = ["whatsapp", "email", "web"] as const;
export type PeggyAutoChannel = (typeof PEGGY_AUTO_CHANNELS)[number];
export type PeggySettings = { autoReply: PeggyAutoChannel[] };

export const PEGGY_CHANNEL_LABEL: Record<PeggyAutoChannel, string> = {
  whatsapp: "WhatsApp messages",
  email: "Emails to support@",
  web: "Website contact forms",
};

/** Peggy may answer by herself at most this many times a day in one conversation. */
export const PEGGY_DAILY_LIMIT = 4;
/** A person on the team who replied within this long is handling it: Peggy stays out. */
export const HUMAN_HANDLING_MS = 24 * 3_600_000;

export type ReplyChannel = "whatsapp" | "email" | "app";

/** Where the reply will be read: WhatsApp conversations on WhatsApp, anyone with an email by email, else in the app. */
export function peggyChannel(source: string, hasEmail: boolean): ReplyChannel {
  if (source === "whatsapp") return "whatsapp";
  return hasEmail ? "email" : "app";
}

export function peggyFormat(channel: ReplyChannel, name: string) {
  const first = name.trim().split(/\s+/)[0] || "there";
  if (channel === "whatsapp") {
    return `FORMAT (WhatsApp): greet ${first} by first name. Short paragraphs, 40-150 words in all. Plain text, no Markdown, no headings; *bold* sparingly is fine, and a dash list only if it really helps. At most one emoji. Sign off "- Peggy, Shopinbos".`;
  }
  if (channel === "email") {
    return `FORMAT (email): start "Hi ${first},". Short paragraphs, 80-250 words in all. Plain text (no Markdown symbols; a simple "- " list is fine for steps). No subject line. End with "Peggy" on one line and "Shopinbos" on the next.`;
  }
  return `FORMAT (in-app chat): greet ${first}. 40-150 words, plain text, no Markdown. Sign off "- Peggy, Shopinbos".`;
}

/**
 * May Peggy answer this conversation by herself now? Only when auto-reply is on for its channel, the customer
 * spoke last, no person on the team replied in the last day, and she's under her daily limit.
 */
export function peggyMayAutoReply(input: {
  settings: PeggySettings;
  source: string;
  hasEmail: boolean;
  status: string;
  /** Public messages, newest first. */
  messages: Array<{ authorType: string; createdAt: Date | string }>;
  now: number;
}): { ok: true } | { ok: false; reason: string } {
  const channel: PeggyAutoChannel | null = input.source === "whatsapp" ? "whatsapp" : input.source === "email" ? "email" : input.source === "web" ? "web" : null;
  if (!channel || !input.settings.autoReply.includes(channel)) return { ok: false, reason: "off" };
  if (channel !== "whatsapp" && !input.hasEmail) return { ok: false, reason: "no-email" };
  if (input.status === "closed") return { ok: false, reason: "closed" };
  if (input.messages[0]?.authorType !== "user") return { ok: false, reason: "not-their-turn" };
  const since = (value: Date | string) => input.now - new Date(value).getTime();
  if (input.messages.some((m) => m.authorType === "agent" && since(m.createdAt) < HUMAN_HANDLING_MS)) return { ok: false, reason: "human" };
  if (input.messages.filter((m) => m.authorType === "ai" && since(m.createdAt) < 24 * 3_600_000).length >= PEGGY_DAILY_LIMIT) return { ok: false, reason: "limit" };
  return { ok: true };
}

export type LeadForPeggy = {
  kind: string;
  role: string;
  source: string;
  pageUrl: string | null;
  message: string | null;
  createdAt: Date | string;
  convertedAt: Date | string | null;
};
export type LeadMessageForPeggy = { channel: string; createdAt: Date | string; template: string | null; from: string | null };

const roleName = (role: string) => (role === "delivery" ? "delivery partner" : role === "supplier" ? "supplier" : "seller");
const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

/** People we found and contacted first (Admin › Lead campaigns › WhatsApp › Partnership outreach, or partner emails). */
export function isOutreachLead(lead: Pick<LeadForPeggy, "source">) {
  return /outreach|partner-email/i.test(lead.source);
}

/**
 * How Shopinbos and this person came to be talking, for Peggy: someone who joined the waitlist heard from us
 * because they signed up (say so, so our message doesn't read as random); someone on a partnership outreach list
 * never signed up (we found their business and reached out first, so never thank them for joining).
 */
export function leadContext(lead: LeadForPeggy, sent: LeadMessageForPeggy[] = []) {
  const lines: string[] = [];
  const company = lead.message?.match(/^Company:\s*(.+)$/m)?.[1]?.trim();
  if (isOutreachLead(lead)) {
    lines.push(
      `HOW WE MET: partnership outreach. They did NOT sign up or join the waitlist: the Shopinbos team found ${company ? `their business (${company})` : "their business"} and reached out first, inviting them to partner as a ${roleName(lead.role)}. Never thank them for signing up or say they joined. If they ask how we got their number or email, say honestly that it's listed publicly for their business and we reached out because we'd like to partner with them; offer to stop messaging if they prefer.`,
    );
  } else if (lead.kind === "waitlist" || lead.kind === "signup_start" || lead.kind === "app_notify") {
    lines.push(
      `HOW WE MET: they joined the Shopinbos waitlist on ${day(lead.createdAt)} as a ${roleName(lead.role)}${lead.pageUrl ? ` (${lead.pageUrl})` : ""}. Every message we sent them was because they signed up. If they seem unsure who we are or why we're messaging, gently remind them they joined the waitlist on shopinbos.com on that date.`,
    );
  } else {
    lines.push(`HOW WE MET: they filled in a form on the website (${lead.kind}${lead.pageUrl ? `, ${lead.pageUrl}` : ""}) on ${day(lead.createdAt)}, as a ${roleName(lead.role)} lead.`);
  }
  const notes = lead.message?.replace(/^Company:.*$/m, "").trim();
  if (notes) lines.push(`Team notes: ${notes.replace(/\s+/g, " ").slice(0, 600)}`);
  lines.push(lead.convertedAt ? "They already have a Shopinbos account." : "No Shopinbos account yet.");
  if (sent.length) {
    const list = sent
      .slice(0, 8)
      .map((m) => `${day(m.createdAt)} ${m.channel}${m.template ? ` "${m.template}"` : ""}${m.from ? ` (${m.from})` : ""}`)
      .join("; ");
    lines.push(`What we've sent them, newest first: ${list}. They may be replying to the latest one.`);
  }
  return lines.join("\n");
}
