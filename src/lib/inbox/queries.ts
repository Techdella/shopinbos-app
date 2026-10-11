import "server-only";

import { db } from "@/lib/db/client";
import { CHANNELS, isChannelKey, type InboxChannelKey } from "./pure";
import { customerSummary } from "./service";

// What the inbox screens read: one list mixing customer conversations (every channel) with the seller's
// supplier and delivery-partner chats, and one thread with the customer sidebar.

export type ListChannel = InboxChannelKey | "partner";

export interface InboxListItem {
  key: string;
  source: "inbox" | "partner";
  id: string;
  channel: ListChannel;
  name: string;
  sub: string | null;
  preview: string;
  at: string;
  unread: number;
  status: "open" | "snoozed" | "closed";
  snoozedUntil: string | null;
  assigneeEmail: string | null;
  tags: string[];
  avatarUrl: string | null;
  partner: { contactUserId: string; role: string } | null;
}

export interface InboxThreadMessage {
  id: string;
  direction: "inbound" | "outbound" | "note";
  kind: string;
  body: string;
  status: string;
  error: string | null;
  authorName: string | null;
  attachments: Array<{ type: string; url?: string | null; name?: string | null; contentType?: string | null; mediaId?: string | null }>;
  createdAt: string;
}

const PARTNER_ROLE: Record<string, string> = { supplier: "Supplier", logistics_partner: "Delivery partner", seller: "Seller", admin: "Shopinbos" };

export function contactLabel(c: { contactName: string | null; contactEmail: string | null; contactPhone: string | null; contactHandle: string | null; channel: string }) {
  return c.contactName || c.contactHandle || c.contactEmail || c.contactPhone || (c.channel === "livechat" ? "Store visitor" : "Unknown");
}

function effectiveStatus(status: string, snoozedUntil: Date | null, now: Date): InboxListItem["status"] {
  if (status === "snoozed" && snoozedUntil && snoozedUntil <= now) return "open";
  return status === "closed" || status === "snoozed" ? status : "open";
}

export async function listInbox(storeId: string, userId: string): Promise<InboxListItem[]> {
  const now = new Date();
  const [conversations, partnerChats] = await Promise.all([
    db.inboxConversation.findMany({ where: { storeId }, orderBy: { lastMessageAt: "desc" }, take: 300 }),
    db.conversation
      .findMany({
        where: { OR: [{ participant1Id: userId }, { participant2Id: userId }], messages: { some: {} } },
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: {
          participant1: { select: { id: true, name: true, avatarUrl: true, role: true } },
          participant2: { select: { id: true, name: true, avatarUrl: true, role: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, createdAt: true, read: true, senderId: true } },
        },
      })
      .catch(() => []),
  ]);

  const items: InboxListItem[] = conversations.map((c) => ({
    key: `c:${c.id}`,
    source: "inbox",
    id: c.id,
    channel: isChannelKey(c.channel) ? c.channel : "livechat",
    name: contactLabel(c),
    sub: c.contactEmail || c.contactPhone || c.contactHandle || null,
    preview: c.lastMessagePreview ?? "",
    at: c.lastMessageAt.toISOString(),
    unread: c.unreadCount,
    status: effectiveStatus(c.status, c.snoozedUntil, now),
    snoozedUntil: c.snoozedUntil?.toISOString() ?? null,
    assigneeEmail: c.assigneeEmail,
    tags: c.tags,
    avatarUrl: null,
    partner: null,
  }));

  for (const chat of partnerChats) {
    const other = chat.participant1Id === userId ? chat.participant2 : chat.participant1;
    const last = chat.messages[0];
    items.push({
      key: `p:${chat.id}`,
      source: "partner",
      id: chat.id,
      channel: "partner",
      name: other.name,
      sub: PARTNER_ROLE[other.role] ?? other.role,
      preview: last?.text ?? "",
      at: (last?.createdAt ?? chat.updatedAt).toISOString(),
      unread: last && !last.read && last.senderId !== userId ? 1 : 0,
      status: "open",
      snoozedUntil: null,
      assigneeEmail: null,
      tags: [],
      avatarUrl: other.avatarUrl,
      partner: { contactUserId: other.id, role: other.role },
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export async function getThread(storeId: string, conversationId: string) {
  const conversation = await db.inboxConversation.findFirst({ where: { id: conversationId, storeId } });
  if (!conversation) return null;
  const [messages, customer, related] = await Promise.all([
    db.inboxMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 300 }),
    customerSummary(storeId, { email: conversation.contactEmail, phone: conversation.contactPhone }),
    conversation.contactEmail || conversation.contactPhone
      ? db.inboxConversation.findMany({
          where: {
            storeId,
            id: { not: conversation.id },
            OR: [...(conversation.contactEmail ? [{ contactEmail: conversation.contactEmail }] : []), ...(conversation.contactPhone ? [{ contactPhone: conversation.contactPhone }] : [])],
          },
          orderBy: { lastMessageAt: "desc" },
          take: 6,
          select: { id: true, channel: true, lastMessagePreview: true, lastMessageAt: true },
        })
      : Promise.resolve([]),
  ]);
  if (conversation.unreadCount > 0) await db.inboxConversation.update({ where: { id: conversation.id }, data: { unreadCount: 0 } });

  const channel = isChannelKey(conversation.channel) ? conversation.channel : "livechat";
  return {
    conversation: {
      id: conversation.id,
      channel,
      channelLabel: CHANNELS[channel].label,
      name: contactLabel(conversation),
      contactName: conversation.contactName,
      contactEmail: conversation.contactEmail,
      contactPhone: conversation.contactPhone,
      contactHandle: conversation.contactHandle,
      subject: conversation.subject,
      status: effectiveStatus(conversation.status, conversation.snoozedUntil, new Date()),
      snoozedUntil: conversation.snoozedUntil?.toISOString() ?? null,
      assigneeEmail: conversation.assigneeEmail,
      tags: conversation.tags,
      lastInboundAt: conversation.lastInboundAt?.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
    },
    messages: messages.map(
      (m): InboxThreadMessage => ({
        id: m.id,
        direction: m.direction === "outbound" || m.direction === "note" ? m.direction : "inbound",
        kind: m.kind,
        body: m.body,
        status: m.status,
        error: m.error,
        authorName: m.authorName,
        attachments: Array.isArray(m.attachments) ? (m.attachments as InboxThreadMessage["attachments"]) : [],
        createdAt: m.createdAt.toISOString(),
      }),
    ),
    customer,
    related: related.map((r) => ({ id: r.id, channel: r.channel, preview: r.lastMessagePreview ?? "", at: r.lastMessageAt.toISOString() })),
  };
}

export type InboxThread = NonNullable<Awaited<ReturnType<typeof getThread>>>;

/** The people a conversation can be assigned to: the owner and the team invited in Settings → Team. */
export async function teamOptions(storeId: string, owner: { email: string; name: string }) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  const settings = (store?.brandSettings ?? {}) as { pendingInvites?: unknown };
  const invites = Array.isArray(settings.pendingInvites) ? settings.pendingInvites.filter((e): e is string => typeof e === "string") : [];
  return [{ email: owner.email, label: `${owner.name} (you)` }, ...invites.map((email) => ({ email, label: email }))];
}
