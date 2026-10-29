// What a seller is told when someone is on their store or starts a live chat (the "livechat" notification
// category in shared/notifications.ts). Pure, unit tested in tests/seller-alerts.test.mjs; the sending is in
// ./seller-alerts.server.ts and src/lib/inbox/service.ts.

/** At most one "someone is on your store" alert per store in this window (the count says how many came). */
export const VISITOR_ALERT_WINDOW_MS = 15 * 60_000;

/** A shopper writing again after this long counts as starting a new chat (WhatsApp and email the seller again). */
export const LIVECHAT_RESTART_MS = 6 * 60 * 60_000;

/** The notify() dedupe key that makes the visitor alert once per store per window. */
export function visitorAlertKey(storeId: string, now: Date) {
  return `store.visitor:${storeId}:${Math.floor(now.getTime() / VISITOR_ALERT_WINDOW_MS)}`;
}

const SOURCE_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google: "Google",
  email: "an email",
  x: "X",
  sms: "a text message",
};

/**
 * "Someone is on your store" / "3 people are on your store", where the latest one came from when known, and what
 * to do about it (with live chat on, their questions come to the inbox; without it, turn it on).
 */
export function visitorAlertText(input: { count: number; source?: string | null; storeName: string; chatOn: boolean }) {
  const count = Math.max(1, Math.floor(input.count || 1));
  const from = input.source ? SOURCE_NAMES[input.source] : undefined;
  const title = count === 1 ? "Someone is on your store" : `${count} people are on your store`;
  const arrived = from ? `Just arrived from ${from}. ` : "";
  const next = input.chatOn ? "If they have a question, it comes to your inbox." : "Turn on live chat so they can ask you questions before they leave.";
  return { title, description: `${arrived}${count === 1 ? "They're" : "They're all"} looking around ${input.storeName} right now. ${next}` };
}

/** A shopper's message starts a chat when it's the first one, or the first in LIVECHAT_RESTART_MS. */
export function startsLiveChat(input: { isNew: boolean; lastInboundAt: Date | null | undefined }, now: Date) {
  if (input.isNew || !input.lastInboundAt) return true;
  return now.getTime() - new Date(input.lastInboundAt).getTime() >= LIVECHAT_RESTART_MS;
}

/** "New live chat from Ada" / "New WhatsApp chat on your store", and what they wrote (plus the page they're on). */
export function liveChatAlertText(input: { who?: string | null; preview: string; via?: "chat" | "whatsapp" | null; page?: string | null }) {
  const kind = input.via === "whatsapp" ? "WhatsApp chat" : "live chat";
  const title = input.who ? `New ${kind} from ${input.who}` : `New ${kind} on your store`;
  const said = input.preview.trim() ? `"${input.preview.trim()}"` : "They sent a message.";
  const where = input.page && input.page !== "/" ? ` (on ${input.page})` : "";
  return { title, description: `${said}${where} Reply now while they're still on your store.` };
}
