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
