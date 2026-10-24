// The Chats tab's list, with no imports so tests can run it in Node. A seller's customer conversations
// (/api/app/inbox/conversations) and their supplier and delivery-partner chats (/api/conversations) become one list,
// newest first, filtered All / Customers / Partners / Unread. Suppliers and delivery partners filter by the other
// side's role ("Shops", "Delivery partners", "Suppliers").

export type ChatKind = "customer" | "partner";

export interface MergedChat {
  key: string;
  kind: ChatKind;
  /** Customer chats: the inbox conversation id. Partner chats: the other person's user id. */
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
export function mergeSellerChats(inbox: InboxLike[] | null, contacts: ContactLike[] | null): MergedChat[] {
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
  return [...out, ...partners.values()].sort(newest);
}

export type SellerChatFilter = "all" | "customers" | "partners" | "unread";
export const SELLER_CHAT_FILTERS: readonly SellerChatFilter[] = ["all", "customers", "partners", "unread"];

export function asSellerChatFilter(value: unknown): SellerChatFilter | null {
  return typeof value === "string" && (SELLER_CHAT_FILTERS as readonly string[]).includes(value) ? (value as SellerChatFilter) : null;
}

/** Done (closed) customer chats stay out of the list but a search still finds them. */
export function sellerChatMatches(chat: MergedChat, filter: SellerChatFilter, q = ""): boolean {
  const query = q.trim().toLowerCase();
  if (chat.status === "closed" && !query) return false;
  if (filter === "customers" && chat.kind !== "customer") return false;
  if (filter === "partners" && chat.kind !== "partner") return false;
  if (filter === "unread" && !(chat.unread > 0 && chat.status !== "closed")) return false;
  if (query && ![chat.name, chat.preview, chat.subject ?? ""].join(" ").toLowerCase().includes(query)) return false;
  return true;
}

/** Suppliers and delivery partners: the filter chips, by the other side's role. */
export type RoleChatFilter = "all" | "seller" | "supplier" | "logistics_partner" | "unread";

export function roleChatFilters(viewer: "supplier" | "logistics_partner"): RoleChatFilter[] {
  return viewer === "supplier" ? ["all", "seller", "logistics_partner", "unread"] : ["all", "seller", "supplier", "unread"];
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
