import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications/create";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { sendPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { sendSms } from "@/lib/notifications/service";
import { getPublicEnv } from "@/lib/env";
import {
  BURST_LIMIT,
  SEND_LIMIT,
  UNREAD_EMAIL_DELAY_MINUTES,
  attachmentPathBelongs,
  canMessage,
  contextRefSchema,
  escapeHtml,
  formatMoney,
  messagePreview,
  messagesHref,
  offPlatformNote,
  orderedPair,
  roleLabel,
  sendMessageSchema,
  statusLabel,
  type AttachmentRef,
  type ContextRef,
  type ContextSnapshot,
  type ConversationSummary,
  type PartnerRole,
  type ThreadMessage,
} from "./pure";

// Partner messages on the Conversation/Message models: list, thread, send, read receipts, linked cards,
// files, notifications and the unread-email sweep. Every function checks the viewer is in the conversation.

export interface Viewer {
  id: string;
  role: string;
  name?: string | null;
}

export class ConversationError extends Error {
  constructor(public code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "RATE_LIMITED" | "NOT_READY", message: string) {
    super(message);
  }
  get status() {
    return { NOT_FOUND: 404, FORBIDDEN: 403, BAD_REQUEST: 400, RATE_LIMITED: 429, NOT_READY: 503 }[this.code];
  }
}

// ─── Is the MessageDetail table there yet? ────────────────────────────────────
// Before docs/migrations/2026-10-12-partner-messages.sql runs, messages still work: no files, cards fold
// into the text, no seen time. Checked once a minute until it appears, then never again.

let detailsTable: boolean | null = null;
let detailsCheckedAt = 0;

export async function detailsReady() {
  if (detailsTable) return true;
  if (detailsTable === false && Date.now() - detailsCheckedAt < 60_000) return false;
  try {
    const rows = await db.$queryRaw<Array<{ ok: boolean }>>`SELECT to_regclass('public."MessageDetail"') IS NOT NULL AS ok`;
    detailsTable = Boolean(rows[0]?.ok);
  } catch {
    detailsTable = false;
  }
  detailsCheckedAt = Date.now();
  return detailsTable;
}

// ─── People ───────────────────────────────────────────────────────────────────

type Profile = ConversationSummary["with"] & { email: string | null };

/** Business name and logo for each user: supplier/partner profile, the seller's store, else their own name. */
async function profiles(userIds: string[]) {
  const ids = [...new Set(userIds)];
  const map = new Map<string, Profile>();
  if (!ids.length) return map;
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, role: true, avatarUrl: true, city: true, email: true,
      supplier: { select: { displayName: true, logoUrl: true, slug: true, city: true } },
      logisticsPartner: { select: { displayName: true, logoUrl: true, slug: true, city: true } },
      store: { select: { name: true, logoUrl: true, slug: true, city: true } },
    },
  });
  for (const user of users) {
    const business = user.role === "supplier" ? user.supplier : user.role === "logistics_partner" ? user.logisticsPartner : null;
    const store = user.role === "seller" ? user.store : null;
    map.set(user.id, {
      userId: user.id,
      name: business?.displayName || store?.name || user.name || "Shopinbos member",
      role: user.role as PartnerRole,
      logoUrl: business?.logoUrl ?? store?.logoUrl ?? user.avatarUrl ?? null,
      slug: business?.slug ?? store?.slug ?? null,
      city: business?.city ?? store?.city ?? user.city ?? null,
      email: user.email,
    });
  }
  return map;
}

function publicProfile(profile: Profile | undefined, userId: string): ConversationSummary["with"] {
  if (!profile) return { userId, name: "Shopinbos member", role: "seller", logoUrl: null, slug: null, city: null };
  const { email: _email, ...rest } = profile;
  return rest;
}

/** A user id, supplier id or delivery partner id → the user to talk to. */
export async function resolveCounterpart(ref: string) {
  const [user, supplier, partner] = await Promise.all([
    db.user.findUnique({ where: { id: ref }, select: { id: true, role: true } }),
    db.supplier.findUnique({ where: { id: ref }, select: { userId: true, user: { select: { role: true } } } }),
    db.logisticsPartner.findUnique({ where: { id: ref }, select: { userId: true, user: { select: { role: true } } } }),
  ]);
  if (user) return { userId: user.id, role: user.role as string };
  if (supplier) return { userId: supplier.userId, role: supplier.user.role as string };
  if (partner) return { userId: partner.userId, role: partner.user.role as string };
  return null;
}

// ─── Conversations ────────────────────────────────────────────────────────────

const memberOf = (userId: string): Prisma.ConversationWhereInput => ({ OR: [{ participant1Id: userId }, { participant2Id: userId }] });
const pairWhere = (a: string, b: string): Prisma.ConversationWhereInput => ({
  OR: [{ participant1Id: a, participant2Id: b }, { participant1Id: b, participant2Id: a }],
});

/**
 * The conversation if the viewer is in it, plus every conversation row for the same pair (older code made
 * rows in either order; the thread shows them as one).
 */
export async function accessConversation(viewer: Viewer, conversationId: string) {
  const row = await db.conversation.findFirst({
    where: { id: conversationId, ...memberOf(viewer.id) },
    select: { id: true, participant1Id: true, participant2Id: true },
  });
  if (!row) return null;
  const otherId = row.participant1Id === viewer.id ? row.participant2Id : row.participant1Id;
  const siblings = await db.conversation.findMany({ where: pairWhere(viewer.id, otherId), select: { id: true } });
  return { id: row.id, otherId, ids: [...new Set([row.id, ...siblings.map((s) => s.id)])] };
}

/** Accepts a conversation id, or (for older links) the other person's user/supplier/partner id. */
export async function accessOrStart(viewer: Viewer, ref: string, create: boolean) {
  const access = await accessConversation(viewer, ref);
  if (access) return access;
  const counterpart = await resolveCounterpart(ref);
  if (!counterpart || counterpart.userId === viewer.id) return null;
  if (!create) {
    const existing = await db.conversation.findFirst({ where: pairWhere(viewer.id, counterpart.userId), orderBy: { updatedAt: "desc" }, select: { id: true } });
    return existing ? accessConversation(viewer, existing.id) : null;
  }
  const started = await startConversation(viewer, ref);
  return accessConversation(viewer, started.id);
}

export async function startConversation(viewer: Viewer, ref: string): Promise<ConversationSummary> {
  const counterpart = await resolveCounterpart(ref);
  if (!counterpart) throw new ConversationError("NOT_FOUND", "We couldn't find that business.");
  if (counterpart.userId === viewer.id) throw new ConversationError("BAD_REQUEST", "That's you.");
  if (!canMessage(viewer.role, counterpart.role)) {
    throw new ConversationError("FORBIDDEN", `${roleLabel(viewer.role)}s can't message ${roleLabel(counterpart.role).toLowerCase()}s here.`);
  }
  let conversation = await db.conversation.findFirst({ where: pairWhere(viewer.id, counterpart.userId), orderBy: { updatedAt: "desc" }, select: { id: true } });
  if (!conversation) {
    const [participant1Id, participant2Id] = orderedPair(viewer.id, counterpart.userId);
    conversation = await db.conversation
      .create({ data: { participant1Id, participant2Id }, select: { id: true } })
      // Two tabs starting the same chat at once: the second create hits the unique pair, so read it back.
      .catch(() => db.conversation.findFirstOrThrow({ where: pairWhere(viewer.id, counterpart.userId), select: { id: true } }));
  }
  const list = await listConversations(viewer);
  return (
    list.find((item) => item.with.userId === counterpart.userId) ?? {
      id: conversation.id,
      with: publicProfile((await profiles([counterpart.userId])).get(counterpart.userId), counterpart.userId),
      lastMessage: null,
      unread: 0,
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function listConversations(viewer: Viewer): Promise<ConversationSummary[]> {
  const rows = await db.conversation.findMany({
    where: memberOf(viewer.id),
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true, participant1Id: true, participant2Id: true, updatedAt: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, text: true, senderId: true, createdAt: true, read: true } },
    },
  });
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [unreadRows, people, details] = await Promise.all([
    db.message.groupBy({ by: ["conversationId"], where: { conversationId: { in: ids }, read: false, senderId: { not: viewer.id } }, _count: { _all: true } }),
    profiles(rows.map((row) => (row.participant1Id === viewer.id ? row.participant2Id : row.participant1Id))),
    lastMessageDetails(rows.flatMap((row) => (row.messages[0] && !row.messages[0].text.trim() ? [row.messages[0].id] : []))),
  ]);
  const unreadBy = new Map(unreadRows.map((row) => [row.conversationId, row._count._all]));

  // One entry per person, even when older code left two rows for the pair.
  const byOther = new Map<string, ConversationSummary & { lastAt: number }>();
  for (const row of rows) {
    const otherId = row.participant1Id === viewer.id ? row.participant2Id : row.participant1Id;
    const last = row.messages[0];
    const detail = last ? details.get(last.id) : undefined;
    const lastMessage = last
      ? { text: messagePreview({ text: last.text, attachments: detail?.attachments, context: detail?.context }), mine: last.senderId === viewer.id, createdAt: last.createdAt.toISOString(), seen: last.read }
      : null;
    const lastAt = last ? last.createdAt.getTime() : 0;
    const existing = byOther.get(otherId);
    if (existing) {
      existing.unread += unreadBy.get(row.id) ?? 0;
      if (lastAt > existing.lastAt) Object.assign(existing, { lastMessage, lastAt });
      continue;
    }
    byOther.set(otherId, {
      id: row.id,
      with: publicProfile(people.get(otherId), otherId),
      lastMessage,
      unread: unreadBy.get(row.id) ?? 0,
      updatedAt: (last?.createdAt ?? row.updatedAt).toISOString(),
      lastAt,
    });
  }
  return [...byOther.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ lastAt: _lastAt, ...summary }) => summary);
}

async function lastMessageDetails(messageIds: string[]) {
  const map = new Map<string, { attachments: AttachmentRef[]; context: ContextSnapshot | null }>();
  if (!messageIds.length || !(await detailsReady())) return map;
  const rows = await db.messageDetail.findMany({ where: { messageId: { in: messageIds } }, select: { messageId: true, attachments: true, context: true } }).catch(() => []);
  for (const row of rows) map.set(row.messageId, { attachments: asAttachments(row.attachments), context: asContext(row.context) });
  return map;
}

export async function unreadCount(userId: string) {
  return db.message.count({ where: { read: false, senderId: { not: userId }, conversation: memberOf(userId) } });
}

// ─── Thread ───────────────────────────────────────────────────────────────────

const PAGE = 60;

function asAttachments(value: unknown): AttachmentRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AttachmentRef => Boolean(item && typeof item === "object" && typeof (item as AttachmentRef).path === "string"));
}

function asContext(value: unknown): ContextSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as ContextSnapshot;
  return contextRefSchema.safeParse(snapshot).success && typeof snapshot.label === "string" ? snapshot : null;
}

function fileUrl(conversationId: string, messageId: string, index: number) {
  return `/api/conversations/${conversationId}/files/${messageId}/${index}`;
}

/** Both people's roles, so chats with a delivery partner get the off-app note (pure.ts offPlatformNote). */
async function chatRoles(viewer: Viewer, otherId: string): Promise<string[]> {
  if (viewer.role === "logistics_partner") return [viewer.role];
  const other = await db.user.findUnique({ where: { id: otherId }, select: { role: true } }).catch(() => null);
  return [viewer.role, String(other?.role ?? "")];
}

async function toThreadMessages(
  viewer: Viewer,
  conversationId: string,
  rows: Array<{ id: string; text: string; senderId: string; createdAt: Date; read: boolean }>,
  roles: string[] = [viewer.role],
): Promise<ThreadMessage[]> {
  const details = new Map<string, { attachments: AttachmentRef[]; context: ContextSnapshot | null; readAt: Date | null }>();
  if (rows.length && (await detailsReady())) {
    const found = await db.messageDetail
      .findMany({ where: { messageId: { in: rows.map((row) => row.id) } }, select: { messageId: true, attachments: true, context: true, readAt: true } })
      .catch(() => []);
    for (const row of found) details.set(row.messageId, { attachments: asAttachments(row.attachments), context: asContext(row.context), readAt: row.readAt });
  }
  return rows.map((row) => {
    const detail = details.get(row.id);
    return {
      id: row.id,
      mine: row.senderId === viewer.id,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      read: row.read,
      readAt: detail?.readAt?.toISOString() ?? null,
      attachments: (detail?.attachments ?? []).map((file, index) => ({ name: file.name, type: file.type, size: file.size, url: fileUrl(conversationId, row.id, index) })),
      context: detail?.context ?? null,
      warning: offPlatformNote(row.text, roles),
    };
  });
}

/**
 * Messages in a conversation, oldest first: the latest page, the page `before` a time (scrolling up), or
 * everything `after` a time (polling). Opening or polling marks the other person's messages read.
 */
export async function getThread(viewer: Viewer, ref: string, options: { after?: string; before?: string } = {}) {
  const access = await accessOrStart(viewer, ref, false);
  if (!access) {
    // An older link with someone the viewer hasn't talked to yet: show an empty chat with them.
    const counterpart = await resolveCounterpart(ref);
    if (!counterpart || counterpart.userId === viewer.id) throw new ConversationError("NOT_FOUND", "Conversation not found.");
    return { conversation: null, messages: [] as ThreadMessage[], hasMore: false, seenUpTo: null as string | null };
  }

  const base: Prisma.MessageWhereInput = { conversationId: { in: access.ids } };
  const select = { id: true, text: true, senderId: true, createdAt: true, read: true } as const;
  let rows;
  let hasMore = false;
  if (options.after) {
    rows = await db.message.findMany({ where: { ...base, createdAt: { gt: new Date(options.after) } }, orderBy: { createdAt: "asc" }, take: 200, select });
  } else {
    const page = await db.message.findMany({
      where: { ...base, ...(options.before ? { createdAt: { lt: new Date(options.before) } } : {}) },
      orderBy: { createdAt: "desc" },
      take: PAGE + 1,
      select,
    });
    hasMore = page.length > PAGE;
    rows = page.slice(0, PAGE).reverse();
  }

  await markRead(viewer, access);
  const roles = await chatRoles(viewer, access.otherId);
  const [messages, seen, summary] = await Promise.all([
    toThreadMessages(viewer, access.id, rows, roles),
    db.message.findFirst({ where: { ...base, senderId: viewer.id, read: true }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    options.after ? Promise.resolve(null) : summaryFor(viewer, access.id, access.otherId),
  ]);
  return { conversation: summary, messages, hasMore, seenUpTo: seen?.createdAt.toISOString() ?? null };
}

async function summaryFor(viewer: Viewer, conversationId: string, otherId: string): Promise<ConversationSummary> {
  const list = await listConversations(viewer);
  return (
    list.find((item) => item.with.userId === otherId) ?? {
      id: conversationId,
      with: publicProfile((await profiles([otherId])).get(otherId), otherId),
      lastMessage: null,
      unread: 0,
      updatedAt: new Date().toISOString(),
    }
  );
}

export async function markRead(viewer: Viewer, access: { ids: string[] }) {
  const unread = await db.message.findMany({
    where: { conversationId: { in: access.ids }, read: false, senderId: { not: viewer.id } },
    select: { id: true },
    take: 500,
  });
  if (!unread.length) return 0;
  const ids = unread.map((row) => row.id);
  const now = new Date();
  await db.message.updateMany({ where: { id: { in: ids } }, data: { read: true } });
  if (await detailsReady()) {
    await db.messageDetail.createMany({ data: ids.map((messageId) => ({ messageId, readAt: now })), skipDuplicates: true }).catch(() => null);
    await db.messageDetail.updateMany({ where: { messageId: { in: ids }, readAt: null }, data: { readAt: now } }).catch(() => null);
  }
  // The "new message" notifications for this chat are done with too.
  await db.notification
    .updateMany({
      where: { userId: viewer.id, read: false, OR: access.ids.map((id) => ({ metadata: { path: ["conversationId"], equals: id } })) },
      data: { read: true, readAt: now },
    })
    .catch(() => null);
  return ids.length;
}

// ─── Sending ──────────────────────────────────────────────────────────────────

/**
 * Sends a message. Never blocked for sharing contact or payment details: in a chat with a delivery partner the
 * result (and the thread) carries `warning`, a gentle note to keep jobs and payments in Shopinbos.
 */
export async function sendPartnerMessage(viewer: Viewer, ref: string, raw: unknown): Promise<ThreadMessage & { conversationId: string }> {
  if (!checkRateLimit(`partner-msg:${viewer.id}`, SEND_LIMIT).allowed) {
    throw new ConversationError("RATE_LIMITED", "You're sending messages very fast. Wait a moment and try again.");
  }
  const parsed = sendMessageSchema.safeParse(raw);
  if (!parsed.success) throw new ConversationError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the message and try again.");
  const input = parsed.data;

  const access = await accessOrStart(viewer, ref, true);
  if (!access) throw new ConversationError("NOT_FOUND", "Conversation not found.");
  if (!checkRateLimit(`partner-msg:${viewer.id}:${access.id}`, BURST_LIMIT).allowed) {
    throw new ConversationError("RATE_LIMITED", "Slow down a little. Try again in a few seconds.");
  }

  const ready = await detailsReady();
  if (input.attachments.length && !ready) throw new ConversationError("NOT_READY", "Sending files needs a quick database update first. Send the message as text for now.");
  for (const file of input.attachments) {
    if (!access.ids.some((id) => attachmentPathBelongs(file.path, id))) throw new ConversationError("FORBIDDEN", "That file wasn't uploaded to this conversation.");
  }

  const context = input.context ? await resolveContext(viewer, input.context) : null;
  if (input.context && !context) throw new ConversationError("NOT_FOUND", "You can only link your own orders and bookings, or a live product.");

  // Without the detail table the card still reaches them, as a line of text.
  const text = context && !ready ? [input.text, `Re: ${context.label}${context.sub ? ` (${context.sub})` : ""}`].filter(Boolean).join("\n\n") : input.text;

  const message = await db.message.create({
    data: { conversationId: access.id, senderId: viewer.id, text },
    select: { id: true, text: true, senderId: true, createdAt: true, read: true },
  });
  if (ready && (input.attachments.length || context)) {
    await db.messageDetail.create({
      data: { messageId: message.id, attachments: input.attachments as unknown as Prisma.InputJsonValue, context: (context ?? undefined) as Prisma.InputJsonValue | undefined },
      select: { messageId: true },
    });
  }
  await db.conversation.update({ where: { id: access.id }, data: { updatedAt: message.createdAt }, select: { id: true } });

  await notifyRecipient(viewer, access, messagePreview({ text, attachments: input.attachments, context })).catch((error) => {
    console.error("Partner message notification failed:", error);
  });

  const [threadMessage] = await toThreadMessages(viewer, access.id, [message], await chatRoles(viewer, access.otherId));
  return { ...threadMessage, conversationId: access.id };
}

/** In-app notification for the other person; one per chat until they read it, so a burst isn't ten alerts. */
async function notifyRecipient(viewer: Viewer, access: { id: string; otherId: string; ids: string[] }, preview: string) {
  const people = await profiles([viewer.id, access.otherId]);
  const recipient = people.get(access.otherId);
  if (!recipient) return;
  const preference = await db.notificationPreference
    .findUnique({ where: { userId_eventKey_category: { userId: recipient.userId, eventKey: "message_received", category: "marketplace" } }, select: { inApp: true, sms: true } })
    .catch(() => null);

  const pending = await db.notification.findFirst({
    where: { userId: recipient.userId, read: false, OR: access.ids.map((id) => ({ metadata: { path: ["conversationId"], equals: id } })) },
    select: { id: true },
  });
  const senderName = people.get(viewer.id)?.name ?? viewer.name ?? "A business";
  // SMS is opt-in (Settings › Notifications) and, like the alert, once per burst: only when nothing is waiting unread.
  if (preference?.sms && !pending) {
    const phone = (await db.user.findUnique({ where: { id: recipient.userId }, select: { phone: true } }).catch(() => null))?.phone;
    if (phone) {
      const text = preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;
      await sendSms({ to: [phone], message: `Shopinbos: new message from ${senderName}. ${text}`.trim() }).catch(() => null);
    }
  }
  if (preference && !preference.inApp) return;

  const link = messagesHref(recipient.role, { conversation: access.id });
  if (pending) {
    await db.notification.update({ where: { id: pending.id }, data: { description: preview || "New message", createdAt: new Date() }, select: { id: true } });
    return;
  }
  await createNotification({
    userId: recipient.userId,
    type: recipient.role === "logistics_partner" ? "logistics" : recipient.role === "supplier" ? "suppliers" : "marketplace",
    title: `New message from ${senderName}`,
    description: preview || "New message",
    link,
    actionLabel: "Reply",
    actionUrl: link,
    metadata: { conversationId: access.id, kind: "partner_message", senderId: viewer.id },
    event: "message.new",
    dedupeKey: false,
    // The older chat SMS above already texted them; otherwise their Messages switches decide (WhatsApp is on by
    // default for delivery partners).
    phoneHandled: Boolean(preference?.sms),
    // A delivery partner can turn off push for "Messages from shops & suppliers" (the bell still gets it).
    messageSource: "business",
  });
}

// ─── Linked products, orders and bookings ─────────────────────────────────────

/** A card for something the sender may share: a live product (or their own), or an order/booking they're part of. */
export async function resolveContext(viewer: Viewer, ref: ContextRef): Promise<ContextSnapshot | null> {
  switch (ref.kind) {
    case "product": {
      const product = await db.supplierProduct.findUnique({
        where: { id: ref.id },
        select: { id: true, name: true, slug: true, images: true, wholesalePrice: true, currency: true, moq: true, status: true, supplier: { select: { userId: true } } },
      });
      if (!product || (product.status !== "published" && product.supplier.userId !== viewer.id)) return null;
      return { kind: "product", id: product.id, label: product.name, sub: `${formatMoney(product.wholesalePrice, product.currency)} wholesale · MOQ ${product.moq}`, image: product.images[0] ?? null, slug: product.slug };
    }
    case "order": {
      const order = await db.retailOrder.findFirst({
        where: { id: ref.id, store: { userId: viewer.id } },
        select: { id: true, orderNumber: true, items: true, total: true, currency: true, status: true },
      });
      if (!order) return null;
      const items = Array.isArray(order.items) ? order.items.length : 0;
      return { kind: "order", id: order.id, label: `Order ${order.orderNumber}`, sub: `${items} item${items === 1 ? "" : "s"} · ${formatMoney(order.total, order.currency)} · ${statusLabel(order.status)}`, image: null };
    }
    case "wholesale_order": {
      const order = await db.wholesaleOrder.findFirst({
        where: { id: ref.id, OR: [{ sellerId: viewer.id }, { supplier: { userId: viewer.id } }] },
        select: { id: true, quantity: true, totalPrice: true, currency: true, status: true, supplierProduct: { select: { name: true, images: true } } },
      });
      if (!order) return null;
      return { kind: "wholesale_order", id: order.id, label: `Wholesale order #${order.id.slice(-6).toUpperCase()}`, sub: `${order.supplierProduct.name} × ${order.quantity} · ${formatMoney(order.totalPrice, order.currency)} · ${statusLabel(order.status)}`, image: order.supplierProduct.images[0] ?? null };
    }
    case "booking": {
      const booking = await db.deliveryBooking.findFirst({
        where: { id: ref.id, OR: [{ sellerId: viewer.id }, { logisticsPartner: { userId: viewer.id } }] },
        select: { id: true, trackingCode: true, pickupLocation: true, destination: true, status: true, deliveryFee: true, currency: true },
      });
      if (!booking) return null;
      return { kind: "booking", id: booking.id, label: booking.trackingCode ? `Delivery ${booking.trackingCode}` : `Delivery #${booking.id.slice(-6).toUpperCase()}`, sub: `${booking.pickupLocation} → ${booking.destination} · ${statusLabel(booking.status)}`, image: null };
    }
    default:
      return null;
  }
}

/** What the composer's "Link" menu offers in a chat with `otherId`: products, orders and bookings between the two. */
export async function contextOptions(viewer: Viewer, ref: string) {
  const access = await accessOrStart(viewer, ref, false);
  const counterpart = access ? { userId: access.otherId } : await resolveCounterpart(ref);
  if (!counterpart) throw new ConversationError("NOT_FOUND", "Conversation not found.");
  const otherId = counterpart.userId;
  const roles = await db.user.findMany({ where: { id: { in: [viewer.id, otherId] } }, select: { id: true, role: true } });
  const roleOf = (id: string) => roles.find((row) => row.id === id)?.role as string | undefined;
  const supplierUser = [viewer.id, otherId].find((id) => roleOf(id) === "supplier");
  const sellerUser = [viewer.id, otherId].find((id) => roleOf(id) === "seller");
  const partnerUser = [viewer.id, otherId].find((id) => roleOf(id) === "logistics_partner");

  const options: ContextSnapshot[] = [];
  const [products, wholesale, bookings, orders] = await Promise.all([
    supplierUser
      ? db.supplierProduct.findMany({
          where: { supplier: { userId: supplierUser }, ...(supplierUser === viewer.id ? { status: { not: "rejected" } } : { status: "published" }) },
          orderBy: [{ trendScore: "desc" }, { updatedAt: "desc" }],
          take: 30,
          select: { id: true },
        })
      : [],
    supplierUser && sellerUser
      ? db.wholesaleOrder.findMany({ where: { sellerId: sellerUser, supplier: { userId: supplierUser } }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true } })
      : [],
    partnerUser && sellerUser
      ? db.deliveryBooking.findMany({ where: { sellerId: sellerUser, logisticsPartner: { userId: partnerUser } }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true } })
      : [],
    sellerUser === viewer.id
      ? db.retailOrder.findMany({ where: { store: { userId: viewer.id } }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true } })
      : [],
  ]);
  const refs: ContextRef[] = [
    ...products.map((row) => ({ kind: "product" as const, id: row.id })),
    ...wholesale.map((row) => ({ kind: "wholesale_order" as const, id: row.id })),
    ...bookings.map((row) => ({ kind: "booking" as const, id: row.id })),
    ...orders.map((row) => ({ kind: "order" as const, id: row.id })),
  ];
  for (const snapshot of await Promise.all(refs.map((item) => resolveContext(viewer, item)))) if (snapshot) options.push(snapshot);
  return options;
}

// ─── Files ────────────────────────────────────────────────────────────────────

export async function attachmentFor(viewer: Viewer, conversationId: string, messageId: string, index: number) {
  const access = await accessConversation(viewer, conversationId);
  if (!access || !(await detailsReady())) return null;
  const message = await db.message.findFirst({ where: { id: messageId, conversationId: { in: access.ids } }, select: { id: true, conversationId: true } });
  if (!message) return null;
  const detail = await db.messageDetail.findUnique({ where: { messageId }, select: { attachments: true } });
  const file = asAttachments(detail?.attachments)[index];
  if (!file || !access.ids.some((id) => attachmentPathBelongs(file.path, id))) return null;
  return file;
}

// ─── Unread email ─────────────────────────────────────────────────────────────

/**
 * Emails people about partner messages still unread after UNREAD_EMAIL_DELAY_MINUTES: one email per person
 * per sweep, each message at most once. Runs from /api/conversations/cron and, throttled, from badge polls.
 */
export async function sendUnreadEmails(now = new Date()) {
  if (!(await detailsReady()) || !isEmailConfigured()) return { sent: 0, messages: 0 };
  const pending = await db.message.findMany({
    where: {
      read: false,
      createdAt: { gte: new Date(now.getTime() - 3 * 86_400_000), lte: new Date(now.getTime() - UNREAD_EMAIL_DELAY_MINUTES * 60_000) },
      OR: [{ detail: { is: null } }, { detail: { is: { emailedAt: null } } }],
    },
    orderBy: { createdAt: "asc" },
    take: 300,
    select: { id: true, text: true, senderId: true, conversation: { select: { id: true, participant1Id: true, participant2Id: true } } },
  });
  if (!pending.length) return { sent: 0, messages: 0 };

  // Claim them first so an overlapping sweep can't email the same messages again.
  const ids = pending.map((row) => row.id);
  await db.messageDetail.createMany({ data: ids.map((messageId) => ({ messageId, emailedAt: now })), skipDuplicates: true });
  await db.messageDetail.updateMany({ where: { messageId: { in: ids }, emailedAt: null }, data: { emailedAt: now } });

  const byRecipient = new Map<string, typeof pending>();
  for (const row of pending) {
    const recipient = row.conversation.participant1Id === row.senderId ? row.conversation.participant2Id : row.conversation.participant1Id;
    byRecipient.set(recipient, [...(byRecipient.get(recipient) ?? []), row]);
  }
  const people = await profiles([...byRecipient.keys(), ...pending.map((row) => row.senderId)]);
  const optedOut = new Set(
    (
      await db.notificationPreference.findMany({
        where: { userId: { in: [...byRecipient.keys()] }, eventKey: "message_received", category: "marketplace", email: false },
        select: { userId: true },
      })
    ).map((row) => row.userId),
  );

  const appUrl = getPublicEnv().appUrl.replace(/\/$/, "");
  let sent = 0;
  for (const [recipientId, messages] of byRecipient) {
    const recipient = people.get(recipientId);
    if (!recipient?.email || optedOut.has(recipientId)) continue;
    const senders = [...new Set(messages.map((row) => people.get(row.senderId)?.name ?? "A business"))];
    const subject = messages.length === 1 ? `${senders[0]} sent you a message` : `${messages.length} unread messages from ${senders.slice(0, 2).join(" and ")}${senders.length > 2 ? " and others" : ""}`;
    const link = `${appUrl}${messagesHref(recipient.role, { conversation: messages[messages.length - 1].conversation.id })}`;
    const rows = messages
      .slice(-5)
      .map((row) => html.raw(`<b>${escapeHtml(people.get(row.senderId)?.name ?? "A business")}:</b> ${escapeHtml(messagePreview({ text: row.text }) || "Sent a file")}`))
      .join("");
    const result = await sendPlatformEmail({
      to: recipient.email,
      user: { id: recipientId, role: recipient.role },
      kind: "notification",
      subject,
      heading: subject,
      eyebrow: "Messages",
      preheader: messagePreview({ text: messages[messages.length - 1].text }) || subject,
      bodyHtml: html.quote(rows) + html.small(`You get this when a message waits ${UNREAD_EMAIL_DELAY_MINUTES} minutes unread. Turn it off in your notification settings.`),
      cta: { label: "Reply on Shopinbos", url: link },
    }).catch(() => ({ success: false }));
    if (result.success) sent += 1;
  }
  return { sent, messages: pending.length };
}

let lastSweep = 0;

/** Badge polls nudge the sweep at most every two minutes per server, so email works without a cron too. */
export function sweepDue(now = Date.now()) {
  if (now - lastSweep < 120_000) return false;
  lastSweep = now;
  return true;
}
