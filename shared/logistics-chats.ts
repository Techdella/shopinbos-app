// A delivery partner's chats in one list: their riders (RiderMessage, audience "company") next to the shops and
// suppliers they talk to (partner conversations). Pure, shared by the web Messages page (/logistics/inbox), the
// Today cards (web and phone), the phone's Chats tab and the Riders app's "Messages" card. Unit-tested in
// tests/logistics-chats.test.mjs; the server side is src/lib/logistics/rider-messages.server.ts.

export type ChatKind = "rider" | "seller" | "supplier" | "logistics_partner" | "admin";
export type ChatFilter = "all" | "rider" | "seller" | "supplier" | "unread";

/** How often an open rider chat and the chat list refresh while the page is visible (the rider replies from their app). */
export const RIDER_THREAD_POLL_MS = 10_000;
export const CHAT_LIST_POLL_MS = 15_000;

/** The filter chips on the delivery partner's Messages page: All, Riders, Shops, Suppliers, Unread. */
export const CHAT_FILTERS: readonly ChatFilter[] = ["all", "rider", "seller", "supplier", "unread"];

export interface ChatLast {
  text: string;
  mine: boolean;
  createdAt: string;
  /** Mine and read by the other side. */
  seen: boolean;
}

/** One rider's chat with their company, as the company's list shows it (GET /api/mobile/logistics/rider-chats). */
export interface RiderChatSummary {
  riderId: string;
  name: string;
  phone: string | null;
  active: boolean;
  last: ChatLast | null;
  unread: number;
}

/** One row of the merged list. `id` is the rider id for riders and the conversation id otherwise. */
export interface ChatListItem {
  key: string;
  kind: ChatKind;
  id: string;
  name: string;
  logoUrl: string | null;
  last: ChatLast | null;
  unread: number;
  /** When the chat last moved (the last message, else when it started); "" for a rider never messaged. */
  at: string;
}

type ConversationLike = {
  id: string;
  with: { name: string; role: string; logoUrl?: string | null };
  lastMessage: { text: string; mine: boolean; createdAt: string; seen?: boolean } | null;
  unread: number;
  updatedAt?: string;
};

type MessageRow = { riderId: string; body: string; fromRider: boolean; createdAt: Date | string; readAt: Date | string | null };

const iso = (value: Date | string) => (typeof value === "string" ? value : value.toISOString());

/**
 * The company's rider list: every rider with their last message and how many of the rider's messages are unread.
 * `lastRows` holds (at least) the newest message per rider; `unread` maps rider id → unread count.
 * Riders who wrote recently first; riders never messaged follow, active ones first, by name.
 */
export function riderThreadSummaries(
  riders: Array<{ id: string; name: string; phone?: string | null; status?: string | null }>,
  lastRows: MessageRow[],
  unread: Map<string, number> | Record<string, number>,
): RiderChatSummary[] {
  const count = (id: string) => (unread instanceof Map ? unread.get(id) : unread[id]) ?? 0;
  const newest = new Map<string, MessageRow>();
  for (const row of lastRows) {
    const seen = newest.get(row.riderId);
    if (!seen || iso(row.createdAt) > iso(seen.createdAt)) newest.set(row.riderId, row);
  }
  const list = riders.map((rider): RiderChatSummary => {
    const row = newest.get(rider.id);
    return {
      riderId: rider.id,
      name: rider.name,
      phone: rider.phone ?? null,
      active: (rider.status ?? "active") === "active",
      // From the company's side: "mine" is what the company wrote.
      last: row ? { text: row.body, mine: !row.fromRider, createdAt: iso(row.createdAt), seen: !row.fromRider && Boolean(row.readAt) } : null,
      unread: count(rider.id),
    };
  });
  // A rider who's off the team only stays while there's a chat to look back on.
  return list.filter((item) => item.active || item.last).sort(byRecent);
}

function byRecent(a: { last: ChatLast | null; active?: boolean; name: string }, b: { last: ChatLast | null; active?: boolean; name: string }) {
  if (a.last && b.last) return b.last.createdAt.localeCompare(a.last.createdAt);
  if (a.last || b.last) return a.last ? -1 : 1;
  if ((a.active ?? true) !== (b.active ?? true)) return a.active ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** Riders and conversations in one list, newest first; riders never messaged go to the bottom. */
export function mergeChatList(conversations: ConversationLike[], riders: RiderChatSummary[]): ChatListItem[] {
  const items: ChatListItem[] = [
    ...riders.map((rider) => ({ key: `r:${rider.riderId}`, kind: "rider" as const, id: rider.riderId, name: rider.name, logoUrl: null, last: rider.last, unread: rider.unread, at: rider.last?.createdAt ?? "" })),
    ...conversations.map((item) => ({
      key: `c:${item.id}`,
      kind: (item.with.role || "seller") as ChatKind,
      id: item.id,
      name: item.with.name,
      logoUrl: item.with.logoUrl ?? null,
      last: item.lastMessage ? { text: item.lastMessage.text, mine: item.lastMessage.mine, createdAt: item.lastMessage.createdAt, seen: Boolean(item.lastMessage.seen) } : null,
      unread: item.unread,
      at: item.lastMessage?.createdAt ?? item.updatedAt ?? "",
    })),
  ];
  return items.sort((a, b) => {
    if (a.at && b.at) return b.at.localeCompare(a.at);
    if (a.at || b.at) return a.at ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** The chips: by who's on the other side, or only the unread ones; plus a search over name and last message. */
export function filterChatList<T extends { kind: string; name: string; unread: number; last: { text: string } | null }>(items: T[], filter: ChatFilter, q = ""): T[] {
  const needle = q.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === "unread" && item.unread <= 0) return false;
    if (filter !== "all" && filter !== "unread" && item.kind !== filter) return false;
    if (!needle) return true;
    return item.name.toLowerCase().includes(needle) || (item.last?.text ?? "").toLowerCase().includes(needle);
  });
}

/** Unread messages under each chip (the dot/count on a chip). */
export function chatFilterCounts(items: Array<{ kind: string; unread: number }>): Record<ChatFilter, number> {
  const counts: Record<ChatFilter, number> = { all: 0, rider: 0, seller: 0, supplier: 0, unread: 0 };
  for (const item of items) {
    if (item.unread <= 0) continue;
    counts.all += item.unread;
    counts.unread += 1;
    if (item.kind === "rider" || item.kind === "seller" || item.kind === "supplier") counts[item.kind] += item.unread;
  }
  return counts;
}

/** The Today card: unread chats first (newest first), then the latest others, at most `limit`, only chats with messages. */
export function recentChats<T extends { unread: number; at: string }>(items: T[], limit = 5): T[] {
  const withMessages = items.filter((item) => item.at);
  const unread = withMessages.filter((item) => item.unread > 0);
  const rest = withMessages.filter((item) => item.unread <= 0);
  const byAt = (a: T, b: T) => b.at.localeCompare(a.at);
  return [...unread.sort(byAt), ...rest.sort(byAt)].slice(0, Math.max(0, limit));
}

/** Sum of unread messages (riders and conversations), for badges. */
export function totalUnread(items: Array<{ unread: number }>): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.unread || 0), 0);
}

/**
 * WhatsApp-style runs: messages in a row from the same side, a few minutes apart, sit close together and only the
 * last of a run gets the bubble's tail. Returns message id → { first, last } of its run.
 */
export function bubbleRuns(messages: Array<{ id: string; mine: boolean; createdAt: string }>, gapMs = 5 * 60_000): Map<string, { first: boolean; last: boolean }> {
  const runs = new Map<string, { first: boolean; last: boolean }>();
  const sameRun = (a: { mine: boolean; createdAt: string }, b: { mine: boolean; createdAt: string }) =>
    a.mine === b.mine && a.createdAt.slice(0, 10) === b.createdAt.slice(0, 10) && Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) <= gapMs;
  messages.forEach((message, index) => {
    const before = messages[index - 1];
    const after = messages[index + 1];
    runs.set(message.id, { first: !before || !sameRun(before, message), last: !after || !sameRun(message, after) });
  });
  return runs;
}

const SAFE_ID = /^[\w-]{1,64}$/;

/** The web Messages page on one rider's chat ("<rider> sent a message" links here). */
export function riderInboxHref(riderId: string): string {
  return `/logistics/inbox?rider=${encodeURIComponent(riderId)}`;
}

/** The web Messages page on one conversation. */
export function conversationInboxHref(conversationId: string): string {
  return `/logistics/inbox?c=${encodeURIComponent(conversationId)}`;
}

/** Where a merged-list row opens on the web. */
export function chatHref(item: { kind: string; id: string }): string {
  return item.kind === "rider" ? riderInboxHref(item.id) : conversationInboxHref(item.id);
}

/** The old /logistics/couriers?chat=<rider> link: where it goes now, or null when there's no (valid) rider. */
export function legacyRiderChatRedirect(chat: string | null | undefined): string | null {
  const id = (chat ?? "").trim();
  return id && SAFE_ID.test(id) ? riderInboxHref(id) : null;
}

/** A rider id from ?rider= on the Messages page, or null. */
export function riderParam(value: string | null | undefined): string | null {
  const id = (value ?? "").trim();
  return id && SAFE_ID.test(id) ? id : null;
}

// ─── The rider's side ────────────────────────────────────────────────────────

export interface RiderInboxLast {
  text: string;
  mine: boolean;
  createdAt: string;
}

/** What the Riders app's "Messages" card reads (GET /api/mobile/logistics/rider/messages/summary). */
export interface RiderInboxSummary {
  company: { name: string; unread: number; last: RiderInboxLast | null };
  shops: Array<{ jobId: string; name: string; unread: number; last: RiderInboxLast | null }>;
  unread: number;
}

type RiderRow = { bookingId: string | null; audience: string; body: string; fromRider: boolean; createdAt: Date | string; readAt: Date | string | null };

/**
 * The rider's summary from their messages (newest first or any order): the company chat and one entry per job's
 * shop chat, each with the last message and the unread count (messages from the other side not yet read).
 * Shop chats newest first, at most `maxShops`.
 */
export function riderInboxSummary(rows: RiderRow[], companyName: string, shopNames: Map<string, string> | Record<string, string>, maxShops = 5): RiderInboxSummary {
  const nameOf = (id: string) => (shopNames instanceof Map ? shopNames.get(id) : shopNames[id]) ?? "";
  const company: RiderInboxSummary["company"] = { name: companyName, unread: 0, last: null };
  const shops = new Map<string, RiderInboxSummary["shops"][number]>();
  for (const row of rows) {
    const createdAt = iso(row.createdAt);
    const last = { text: row.body, mine: row.fromRider, createdAt };
    const unread = !row.fromRider && !row.readAt ? 1 : 0;
    if (row.audience === "company") {
      company.unread += unread;
      if (!company.last || createdAt > company.last.createdAt) company.last = last;
    } else if (row.bookingId) {
      const entry = shops.get(row.bookingId) ?? { jobId: row.bookingId, name: nameOf(row.bookingId), unread: 0, last: null };
      entry.unread += unread;
      if (!entry.last || createdAt > entry.last.createdAt) entry.last = last;
      shops.set(row.bookingId, entry);
    }
  }
  const shopList = [...shops.values()].sort((a, b) => (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? "")).slice(0, Math.max(0, maxShops));
  return { company, shops: shopList, unread: company.unread + shopList.reduce((sum, shop) => sum + shop.unread, 0) };
}
