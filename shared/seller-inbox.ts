// A seller's one chat inbox (founder's plan item 8): customers (every channel), suppliers, delivery partners and the
// riders carrying the shop's parcels in one list, each chat showing the order or delivery job it belongs to.
// Creators get a kind (and a chip) now; the chip stays hidden until there are creator chats (creator briefs come later).
// Pure, shared by the web inbox (/home/messages), GET /api/mobile/delivery/rider-chats and the phone's Chats tab.
// Unit-tested in tests/seller-inbox.test.mjs; the server side is src/lib/logistics/rider-messages.server.ts.

export type SellerChatKind = "customer" | "supplier" | "delivery" | "rider" | "creator";
/** The chips: everything, one kind, both business kinds (old /home/messages/partners links) or only unread. */
export type SellerInboxFilter = "all" | SellerChatKind | "partners" | "unread";

export const SELLER_CHAT_KINDS: readonly SellerChatKind[] = ["customer", "supplier", "delivery", "rider", "creator"];

/** The kind of a partner chat from the other side's role. */
export function partnerChatKind(role: string | null | undefined): SellerChatKind {
  if (role === "logistics_partner") return "delivery";
  if (role === "creator") return "creator";
  return "supplier";
}

const FILTER_ALIASES: Record<string, SellerInboxFilter> = {
  customers: "customer",
  suppliers: "supplier",
  riders: "rider",
  creators: "creator",
  logistics: "delivery",
  logistics_partner: "delivery",
};

/** A filter from the address bar (?kind=), with plurals and old names; null when it isn't one. */
export function asSellerInboxFilter(value: unknown): SellerInboxFilter | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (FILTER_ALIASES[key]) return FILTER_ALIASES[key];
  return (["all", "partners", "unread", ...SELLER_CHAT_KINDS] as string[]).includes(key) ? (key as SellerInboxFilter) : null;
}

/**
 * The chips to show: All, Customers, Suppliers, Delivery, Riders, Unread. Creators only once there's a creator chat;
 * "partners" (suppliers and delivery partners together) only while it's the one picked (from an old link).
 */
export function sellerInboxChips(items: Array<{ kind: string }>, active: SellerInboxFilter = "all"): SellerInboxFilter[] {
  const kinds: SellerInboxFilter[] = ["customer", "supplier", "delivery", "rider"];
  if (items.some((item) => item.kind === "creator") || active === "creator") kinds.push("creator");
  if (active === "partners") kinds.push("partners");
  return ["all", ...kinds, "unread"];
}

export function matchesSellerInboxFilter(item: { kind: string; unread: number }, filter: SellerInboxFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return item.unread > 0;
  if (filter === "partners") return item.kind === "supplier" || item.kind === "delivery";
  return item.kind === filter;
}

/** Unread messages under each chip (the count on a chip); "unread" counts chats. */
export function sellerInboxCounts(items: Array<{ kind: string; unread: number }>): Record<SellerInboxFilter, number> {
  const counts: Record<SellerInboxFilter, number> = { all: 0, customer: 0, supplier: 0, delivery: 0, rider: 0, creator: 0, partners: 0, unread: 0 };
  for (const item of items) {
    const unread = Math.max(0, item.unread || 0);
    if (!unread) continue;
    counts.all += unread;
    counts.unread += 1;
    if ((SELLER_CHAT_KINDS as readonly string[]).includes(item.kind)) counts[item.kind as SellerChatKind] += unread;
    if (item.kind === "supplier" || item.kind === "delivery") counts.partners += unread;
  }
  return counts;
}

// ─── Riders on the shop's deliveries ─────────────────────────────────────────

/** Jobs that are over: their rider chats only stay listed while there's something to look back on. */
export const ENDED_DELIVERY = ["delivered", "failed", "cancelled", "declined", "returned"] as const;

export function deliveryEnded(status: string | null | undefined): boolean {
  return (ENDED_DELIVERY as readonly string[]).includes(String(status ?? ""));
}

export interface ShopRiderOrder {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
}

export interface ShopRiderLast {
  text: string;
  mine: boolean;
  createdAt: string;
  /** Mine and read by the rider. */
  seen: boolean;
}

/** One rider chat on one of the shop's delivery jobs (GET /api/mobile/delivery/rider-chats). */
export interface ShopRiderChat {
  jobId: string;
  riderName: string;
  riderPhone: string | null;
  /** The delivery company the rider rides for. */
  company: string;
  /** The job's status (BookingStatus: confirmed, picked_up, in_transit, out_for_delivery…). */
  deliveryStatus: string;
  /** False once the job is delivered, failed, cancelled… (the chat is read-only history then on the order page). */
  active: boolean;
  order: ShopRiderOrder | null;
  last: ShopRiderLast | null;
  unread: number;
  /** When the chat last moved: the last message, else when the job last changed. */
  at: string;
}

type JobRow = {
  id: string;
  status: string;
  orderId: string | null;
  updatedAt: Date | string;
  rider: { name: string; phone?: string | null } | null;
  logisticsPartner?: { displayName?: string | null } | null;
};
type LastRow = { bookingId: string | null; body: string; fromRider: boolean; createdAt: Date | string; readAt: Date | string | null };
type OrderRow = { id: string; orderNumber: string; status: string; total: number | string | { toString(): string }; currency?: string | null };

const iso = (value: Date | string) => (typeof value === "string" ? value : value.toISOString());

/**
 * The shop's rider chats: one per job a rider carries. Jobs still moving are always listed (so the shop can write
 * first); finished jobs only when they have messages. `lastRows` holds (at least) the newest message per job,
 * `unread` maps job id → the rider's unread messages, `orders` the jobs' orders. Newest first.
 */
export function shopRiderChats(
  jobs: JobRow[],
  lastRows: LastRow[],
  unread: Map<string, number> | Record<string, number>,
  orders: OrderRow[] = [],
): ShopRiderChat[] {
  const count = (id: string) => (unread instanceof Map ? unread.get(id) : unread[id]) ?? 0;
  const newest = new Map<string, LastRow>();
  for (const row of lastRows) {
    if (!row.bookingId) continue;
    const seen = newest.get(row.bookingId);
    if (!seen || iso(row.createdAt) > iso(seen.createdAt)) newest.set(row.bookingId, row);
  }
  const byOrder = new Map(orders.map((order) => [order.id, order]));
  const list: ShopRiderChat[] = [];
  for (const job of jobs) {
    if (!job.rider) continue;
    const row = newest.get(job.id);
    const active = !deliveryEnded(job.status);
    if (!active && !row) continue;
    const order = job.orderId ? byOrder.get(job.orderId) : undefined;
    list.push({
      jobId: job.id,
      riderName: job.rider.name,
      riderPhone: job.rider.phone ?? null,
      company: job.logisticsPartner?.displayName ?? "",
      deliveryStatus: job.status,
      active,
      order: order ? { id: order.id, number: order.orderNumber, status: order.status, total: Number(order.total) || 0, currency: order.currency || "NGN" } : null,
      // From the shop's side: "mine" is what the shop wrote.
      last: row ? { text: row.body, mine: !row.fromRider, createdAt: iso(row.createdAt), seen: !row.fromRider && Boolean(row.readAt) } : null,
      unread: count(job.id),
      at: row ? iso(row.createdAt) : iso(job.updatedAt),
    });
  }
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

// ─── Links ────────────────────────────────────────────────────────────────────

const SAFE_ID = /^[\w-]{1,64}$/;

/** The unified inbox on one rider chat (a delivery job id). */
export function riderChatHref(jobId: string): string {
  return `/home/messages?r=${encodeURIComponent(jobId)}`;
}

/** A job id from ?r=, or null. */
export function riderChatParam(value: string | null | undefined): string | null {
  const id = (value ?? "").trim();
  return id && SAFE_ID.test(id) ? id : null;
}

/**
 * Where the old /home/messages/partners page goes now: the unified inbox on the same chat (?c= there is a partner
 * conversation, ?p= here), starting one (?with=&ctx=), or the list on suppliers and delivery partners.
 */
export function partnersPageRedirect(params: { c?: string | null; with?: string | null; ctx?: string | null } | null | undefined): string {
  const out = new URLSearchParams();
  const c = (params?.c ?? "").trim();
  const withId = (params?.with ?? "").trim();
  if (withId && SAFE_ID.test(withId)) {
    out.set("with", withId);
    const ctx = (params?.ctx ?? "").trim();
    if (ctx && /^[a-z_]{1,20}:[\w-]{1,64}$/.test(ctx)) out.set("ctx", ctx);
  } else if (c && SAFE_ID.test(c)) {
    out.set("p", c);
  } else {
    out.set("kind", "partners");
  }
  return `/home/messages?${out.toString()}`;
}

// ─── The order a chat belongs to ─────────────────────────────────────────────

const FINISHED_ORDER = new Set(["delivered", "cancelled", "refunded", "returned", "partially_refunded"]);

/**
 * A customer chat's order: the newest one still in progress, else the newest (orders newest first, as the customer
 * summary lists them). Null when the customer has none.
 */
export function chatOrder<T extends { status: string }>(orders: T[] | null | undefined): T | null {
  const list = orders ?? [];
  return list.find((order) => !FINISHED_ORDER.has(order.status)) ?? list[0] ?? null;
}

/** A partner chat's order or job: the latest order, wholesale order or delivery linked in it (messages oldest first). */
export function chatLinkedContext<T extends { kind: string }>(messages: Array<{ context?: T | null }>): T | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const context = messages[i].context;
    if (context && context.kind !== "product") return context;
  }
  return null;
}
