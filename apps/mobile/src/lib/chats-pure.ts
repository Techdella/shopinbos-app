// The Chats tab's list, with no imports so tests can run it in Node. A seller's one chat inbox (founder's plan item 8,
// the same list as the web's /home/messages, shared/seller-inbox.ts): customer conversations
// (/api/app/inbox/conversations), supplier and delivery-partner chats (/api/conversations) and the riders carrying the
// shop's parcels (/api/mobile/delivery/rider-chats) become one list, newest first, filtered All / Customers /
// Suppliers / Delivery / Riders / Unread (Creators once there are creator chats). Suppliers and delivery partners
// filter by the other side's role ("Shops", "Delivery partners", "Suppliers").

export type ChatKind = "customer" | "partner" | "rider" | "creator";

export interface MergedChat {
  key: string;
  kind: ChatKind;
  /** Customer chats: the inbox conversation id. Partner chats: the other person's user id. Rider chats: the delivery job id. */
  id: string;
  name: string;
  preview: string;
  at: string | null;
  unread: number;
  avatarUrl: string | null;
  /** Customer chats: whatsapp, instagram… Partner chats: "partner". */
  channel: string;
  /** Partner chats: supplier, logistics_partner, seller. */
  role: string | null;
  status: "open" | "snoozed" | "closed";
  subject: string | null;
  /** Rider chats: the order the delivery carries and the delivery's status (the chat's context). */
  order?: { id: string; number: string } | null;
  deliveryStatus?: string | null;
}

/** One rider chat on one of the shop's deliveries (GET /api/mobile/delivery/rider-chats, shared/seller-inbox.ts). */
export interface RiderChatLike {
  jobId: string;
  riderName: string;
  deliveryStatus: string;
  order: { id: string; number: string } | null;
  last: { text: string } | null;
  unread: number;
  at: string;
}

interface InboxLike {
  key: string;
  source: "inbox" | "partner";
  id: string;
  channel: string;
  name: string;
  subject?: string | null;
  preview: string;
  at: string;
  unread: number;
  status: "open" | "snoozed" | "closed";
  avatarUrl: string | null;
  partner: { contactUserId: string; role: string } | null;
}

interface ContactLike {
  id: string;
  name: string;
  kind?: string;
  role?: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

const newest = (a: { at: string | null }, b: { at: string | null }) => (b.at ?? "").localeCompare(a.at ?? "");

/** One list from the inbox and the partner conversations. A partner chat in both keeps the newer message and the
 * partner API's unread count (it counts every unread message, the inbox only the last one). */
export function mergeSellerChats(inbox: InboxLike[] | null, contacts: ContactLike[] | null, riders: RiderChatLike[] | null = null): MergedChat[] {
  const out: MergedChat[] = [];
  const partners = new Map<string, MergedChat>();
  for (const item of inbox ?? []) {
    if (item.source === "partner" && item.partner) {
      partners.set(item.partner.contactUserId, {
        key: `p:${item.partner.contactUserId}`,
        kind: "partner",
        id: item.partner.contactUserId,
        name: item.name,
        preview: item.preview,
        at: item.at,
        unread: item.unread,
        avatarUrl: item.avatarUrl,
        channel: "partner",
        role: item.partner.role,
        status: "open",
        subject: null,
      });
    } else {
      out.push({ key: item.key, kind: "customer", id: item.id, name: item.name, preview: item.preview, at: item.at, unread: item.unread, avatarUrl: item.avatarUrl, channel: item.channel, role: null, status: item.status, subject: item.subject ?? null });
    }
  }
  for (const contact of contacts ?? []) {
    const role = contact.role ?? contact.kind ?? "supplier";
    if (role === "seller") continue;
    const known = partners.get(contact.id);
    const at = contact.lastMessageAt ?? null;
    const newer = !known || (at ?? "") >= (known.at ?? "");
    partners.set(contact.id, {
      key: `p:${contact.id}`,
      kind: "partner",
      id: contact.id,
      name: contact.name || known?.name || "",
      preview: (newer ? contact.lastMessage : null) ?? known?.preview ?? "",
      at: (newer ? at : null) ?? known?.at ?? null,
      unread: contact.unread,
      avatarUrl: known?.avatarUrl ?? null,
      channel: "partner",
      role,
      status: "open",
      subject: null,
    });
  }
  for (const rider of riders ?? []) {
    out.push({
      key: `r:${rider.jobId}`,
      kind: "rider",
      id: rider.jobId,
      name: rider.riderName,
      preview: rider.last?.text ?? "",
      at: rider.at,
      unread: rider.unread,
      avatarUrl: null,
      channel: "rider",
      role: "rider",
      status: "open",
      subject: null,
      order: rider.order ? { id: rider.order.id, number: rider.order.number } : null,
      deliveryStatus: rider.deliveryStatus,
    });
  }
  return [...out, ...partners.values()].sort(newest);
}

/** The chips: All, Customers, Suppliers, Delivery (delivery partners), Riders (the riders carrying your parcels),
 * Unread; Creators only once there are creator chats. "partners" (suppliers and delivery partners) is no chip any more
 * but still opens from old links (?filter=partners). */
export type SellerChatFilter = "all" | "customers" | "suppliers" | "delivery" | "riders" | "creators" | "partners" | "unread";
export const SELLER_CHAT_FILTERS: readonly SellerChatFilter[] = ["all", "customers", "suppliers", "delivery", "riders", "unread"];

export function asSellerChatFilter(value: unknown): SellerChatFilter | null {
  return typeof value === "string" && ([...SELLER_CHAT_FILTERS, "creators", "partners"] as readonly string[]).includes(value) ? (value as SellerChatFilter) : null;
}

/** The chips to show: the usual ones, Creators once a creator chat exists, and the picked old-link chip. */
export function sellerChatFilters(chats: { kind: ChatKind }[] | null | undefined, active: SellerChatFilter = "all"): SellerChatFilter[] {
  const list = [...SELLER_CHAT_FILTERS];
  const extra: SellerChatFilter[] = [];
  if ((chats ?? []).some((chat) => chat.kind === "creator") || active === "creators") extra.push("creators");
  if (active === "partners") extra.push("partners");
  list.splice(list.indexOf("unread"), 0, ...extra);
  return list;
}

/** Done (closed) customer chats stay out of the list but a search still finds them. */
export function sellerChatMatches(chat: MergedChat, filter: SellerChatFilter, q = ""): boolean {
  const query = q.trim().toLowerCase();
  if (chat.status === "closed" && !query) return false;
  if (filter === "customers" && chat.kind !== "customer") return false;
  if (filter === "partners" && chat.kind !== "partner") return false;
  if (filter === "delivery" && !(chat.kind === "partner" && chat.role === "logistics_partner")) return false;
  if (filter === "riders" && chat.kind !== "rider") return false;
  if (filter === "creators" && chat.kind !== "creator") return false;
  if (filter === "suppliers" && !(chat.kind === "partner" && chat.role !== "logistics_partner")) return false;
  if (filter === "unread" && !(chat.unread > 0 && chat.status !== "closed")) return false;
  if (query && ![chat.name, chat.preview, chat.subject ?? "", chat.order?.number ?? ""].join(" ").toLowerCase().includes(query)) return false;
  return true;
}

/** Suppliers and delivery partners: the filter chips, by the other side's role. */
/** "rider": a delivery partner's own riders (their chats sit in the same list, role "rider"). */
export type RoleChatFilter = "all" | "rider" | "seller" | "supplier" | "logistics_partner" | "unread";

export function roleChatFilters(viewer: "supplier" | "logistics_partner"): RoleChatFilter[] {
  return viewer === "supplier" ? ["all", "seller", "logistics_partner", "unread"] : ["all", "rider", "seller", "supplier", "unread"];
}

export function roleChatMatches(contact: { name: string; role: string; unread: number; lastMessage: string | null }, filter: RoleChatFilter, q = ""): boolean {
  const query = q.trim().toLowerCase();
  if (filter === "unread" && !(contact.unread > 0)) return false;
  if (filter !== "all" && filter !== "unread" && contact.role !== filter) return false;
  if (query && !`${contact.name} ${contact.lastMessage ?? ""}`.toLowerCase().includes(query)) return false;
  return true;
}

/**
 * The grey line under a chat's name: the last message, without the email's subject in front of it (an email preview
 * often starts with the subject again). Just the subject when there's no message text.
 */
export function chatPreview(subject: string | null | undefined, preview: string | null | undefined): string {
  const body = (preview ?? "").trim();
  const title = (subject ?? "").trim();
  if (!body) return title;
  if (title && body.toLowerCase().startsWith(title.toLowerCase())) {
    const rest = body.slice(title.length).replace(/^[\s·:\-–—|]+/, "").trim();
    return rest || body;
  }
  return body;
}
