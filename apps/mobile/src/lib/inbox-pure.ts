// Inbox list helpers with no imports, so tests/mobile-app.test.mjs can run them in Node. Channel keys and labels
// follow src/lib/inbox/meta.ts on the web side ("partner" is a supplier or delivery-partner chat).

export type InboxChannel = "email" | "whatsapp" | "sms" | "messenger" | "instagram" | "telegram" | "tiktok" | "voice" | "livechat" | "form" | "partner";

export const CHANNEL_LABELS: Record<InboxChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
  messenger: "Messenger",
  instagram: "Instagram",
  telegram: "Telegram",
  tiktok: "TikTok",
  voice: "Phone calls",
  livechat: "Live chat",
  form: "Contact form",
  partner: "Suppliers & delivery",
};

/** Channels where the seller can't reply from the inbox (the web says the same). */
export const NO_REPLY_CHANNELS: InboxChannel[] = ["tiktok", "voice"];

export function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel as InboxChannel] ?? "Message";
}

export type InboxView = "open" | "unread" | "snoozed" | "closed";

interface Filterable {
  channel: string;
  status: "open" | "snoozed" | "closed";
  unread: number;
  name: string;
  preview: string;
  sub: string | null;
}

/** The list for one view ("Open", "Unread", "Snoozed", "Done"), one channel ("" = all) and a search. */
export function filterInbox<T extends Filterable>(items: T[], filters: { view: InboxView; channel: string; q?: string }): T[] {
  const q = (filters.q ?? "").trim().toLowerCase();
  return items.filter((item) => {
    if (filters.channel && item.channel !== filters.channel) return false;
    if (filters.view === "unread" && !(item.unread > 0 && item.status !== "closed")) return false;
    if (filters.view === "open" && item.status !== "open") return false;
    if (filters.view === "snoozed" && item.status !== "snoozed") return false;
    if (filters.view === "closed" && item.status !== "closed") return false;
    if (q && ![item.name, item.preview, item.sub ?? ""].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Channels that have at least one conversation, most used first, for the filter chips. */
export function channelsInUse(items: Array<{ channel: string }>): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.channel, (counts.get(item.channel) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([channel]) => channel);
}

/** "14:05" today, "Mon" this week, "3 Oct" before that (Lagos time). */
export function shortTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const lagos = (d: Date) => new Date(d.getTime() + 60 * 60_000);
  const a = lagos(date);
  const b = lagos(now);
  const sameDay = a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
  if (sameDay) return `${String(a.getUTCHours()).padStart(2, "0")}:${String(a.getUTCMinutes()).padStart(2, "0")}`;
  const days = (b.getTime() - a.getTime()) / 86_400_000;
  if (days < 6) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][a.getUTCDay()];
  return `${a.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][a.getUTCMonth()]}`;
}
