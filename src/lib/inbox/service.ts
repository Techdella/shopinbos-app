import "server-only";

import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { aiText } from "@/lib/ai/text";
import { createNotification } from "@/lib/notifications/create";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { decryptJson } from "./crypto";
import { sendInboxEmail } from "./channels/email";
import { sendMetaMessage } from "./channels/meta";
import { sendTelegram } from "./channels/telegram";
import { sendSmsReply } from "./channels/sms";
import type { SendResult } from "./channels/types";
import { markWhatsAppRead, sendWhatsApp, TOKEN_ERROR } from "./channels/whatsapp";
import { CHANNELS, isSellerOnline, previewText, storeThreadWhere, type InboundAttachment, type InboxChannelKey } from "./pure";
import { AUTO_REPLY_COOLDOWN_MS, chatbotOnDuty, decideAutoReply } from "./assistant";
import { loadAutomation } from "./automation.server";
import { chatbotAnswer, whatsappBotAnswer } from "./chatbot.server";
import { WINDOW_CLOSED_ERROR, whatsAppBotGate, withinServiceWindow, type WhatsAppInteractive } from "./whatsapp-bot";
import { hasAiProvider } from "./ai";

// The inbox core: every webhook and the live-chat widget call ingestInbound; every reply goes through
// sendReply, which picks the adapter for the conversation's channel. Nothing here pretends to send: a
// message is "sent" only when the provider accepted it, and "failed" with the provider's reason otherwise.

const LIVECHAT_EMAIL_AFTER_MS = 2 * 60_000;
const DEFAULT_AWAY = "Thanks for your message! We're away right now and will reply as soon as we're back.";

type StoreRef = { id: string; name: string; slug: string; userId: string };

async function storeById(storeId: string): Promise<StoreRef | null> {
  return db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, userId: true } });
}

// ─── Channels ────────────────────────────────────────────────────────────────

export async function getChannel(storeId: string, channel: InboxChannelKey) {
  const row = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel } } });
  if (!row || row.status !== "connected") return null;
  return { row, credentials: decryptJson<Record<string, string>>(row.credentials) ?? {} };
}

/** The connected channel a webhook belongs to, found by the provider's account id. */
export async function findChannelByAccount(channel: InboxChannelKey, externalId: string) {
  if (!externalId) return null;
  const row = await db.inboxChannel.findFirst({ where: { channel, externalId, status: "connected" } });
  if (!row) return null;
  return { row, credentials: decryptJson<Record<string, string>>(row.credentials) ?? {} };
}

export async function markChannelError(id: string, message: string) {
  await db.inboxChannel.update({ where: { id }, data: { lastError: message.slice(0, 300) } }).catch(() => null);
}

// ─── Inbound ─────────────────────────────────────────────────────────────────

export interface IngestInput {
  storeId: string;
  channel: InboxChannelKey;
  threadId: string;
  subject?: string | null;
  contact: { name?: string | null; email?: string | null; phone?: string | null; handle?: string | null; visitorId?: string | null };
  message: {
    body: string;
    bodyHtml?: string | null;
    externalId?: string | null;
    attachments?: InboundAttachment[];
    kind?: "text" | "call" | "voicemail" | "form";
    status?: string;
    meta?: Record<string, unknown>;
    createdAt?: Date;
  };
  /** Live chat from the widget: the shopper is looking at it right now. */
  visitorSeen?: boolean;
  notify?: boolean;
}

/** Adds an inbound message to its conversation (creating or reopening it). Duplicate provider ids are ignored. */
export async function ingestInbound(input: IngestInput) {
  const externalId = input.message.externalId || null;
  if (externalId) {
    const dupe = await db.inboxMessage.findFirst({ where: { externalId, storeId: input.storeId }, select: { id: true, conversationId: true } });
    if (dupe) return { conversationId: dupe.conversationId, messageId: dupe.id, duplicate: true };
  }

  const body = input.message.body.slice(0, 20000);
  const preview = previewText(body || (input.message.attachments?.length ? "Sent an attachment" : ""));
  const now = input.message.createdAt ?? new Date();
  const existing = await db.inboxConversation.findUnique({
    where: { storeId_channel_externalThreadId: { storeId: input.storeId, channel: input.channel, externalThreadId: input.threadId } },
  });

  const conversation = existing
    ? await db.inboxConversation.update({
        where: { id: existing.id },
        data: {
          status: "open",
          snoozedUntil: null,
          unreadCount: { increment: 1 },
          lastMessageAt: now,
          lastInboundAt: now,
          lastMessagePreview: preview,
          contactName: existing.contactName ?? input.contact.name ?? null,
          contactEmail: existing.contactEmail ?? input.contact.email ?? null,
          contactPhone: existing.contactPhone ?? input.contact.phone ?? null,
          contactHandle: existing.contactHandle ?? input.contact.handle ?? null,
          visitorId: existing.visitorId ?? input.contact.visitorId ?? null,
          subject: existing.subject ?? input.subject ?? null,
          ...(input.visitorSeen ? { visitorSeenAt: new Date() } : {}),
        },
      })
    : await db.inboxConversation.create({
        data: {
          storeId: input.storeId,
          channel: input.channel,
          externalThreadId: input.threadId,
          subject: input.subject ?? null,
          contactName: input.contact.name ?? null,
          contactEmail: input.contact.email ?? null,
          contactPhone: input.contact.phone ?? null,
          contactHandle: input.contact.handle ?? null,
          visitorId: input.contact.visitorId ?? null,
          unreadCount: 1,
          lastMessageAt: now,
          lastInboundAt: now,
          lastMessagePreview: preview,
          visitorSeenAt: input.visitorSeen ? new Date() : null,
        },
      });

  const message = await db.inboxMessage.create({
    data: {
      conversationId: conversation.id,
      storeId: input.storeId,
      direction: "inbound",
      kind: input.message.kind ?? "text",
      body,
      bodyHtml: input.message.bodyHtml ?? null,
      attachments: (input.message.attachments ?? []) as unknown as Prisma.InputJsonValue,
      status: input.message.status ?? "received",
      externalId,
      meta: (input.message.meta ?? {}) as Prisma.InputJsonValue,
      createdAt: now,
    },
  });

  const later = (task: () => Promise<unknown>) => {
    try {
      after(() => task().catch((error) => console.error("[inbox] background task failed", error)));
    } catch {
      void task().catch((error) => console.error("[inbox] background task failed", error));
    }
  };

  if (input.notify !== false) later(() => notifySeller(input.storeId, conversation.id, input.channel, conversation.contactName ?? conversation.contactEmail ?? conversation.contactPhone, preview));
  later(() => maybeAutoReply(conversation.id));

  return { conversationId: conversation.id, messageId: message.id, duplicate: false };
}

async function notifySeller(storeId: string, conversationId: string, channel: InboxChannelKey, who: string | null, preview: string) {
  const store = await storeById(storeId);
  if (!store) return;
  const settings = await db.inboxSettings.findUnique({ where: { storeId }, select: { sellerLastSeenAt: true } });
  // No bell notification while the seller has the inbox open; the list updates by itself.
  if (isSellerOnline(settings?.sellerLastSeenAt)) return;
  await createNotification({
    userId: store.userId,
    type: "customers",
    priority: "info",
    title: channel === "voice" ? `Call from ${who ?? "an unknown number"}` : `New ${CHANNELS[channel].label} message${who ? ` from ${who}` : ""}`,
    description: preview || "Open your inbox to read it.",
    link: `/home/messages?c=${conversationId}`,
    actionLabel: "Reply",
    actionUrl: `/home/messages?c=${conversationId}`,
    metadata: { source: "inbox", channel, conversationId },
  }).catch((error) => console.error("[inbox] notification failed", error));
}

/** Provider delivery receipts (WhatsApp statuses, SMS delivery reports, Resend email events). Pass storeId when the webhook knows it. */
export async function updateMessageStatus(externalId: string, status: string, error?: string | null, storeId?: string) {
  const order = ["queued", "sent", "delivered", "read"];
  const message = await db.inboxMessage.findFirst({ where: { externalId, direction: "outbound", ...(storeId ? { storeId } : {}) }, select: { id: true, status: true } });
  if (!message) return;
  // Receipts can arrive out of order; never move "read" back to "delivered".
  if (status !== "failed" && order.indexOf(status) <= order.indexOf(message.status)) return;
  await db.inboxMessage.update({ where: { id: message.id }, data: { status, error: status === "failed" ? (error ?? "The provider couldn't deliver it.").slice(0, 300) : null } });
}

// ─── Outbound ────────────────────────────────────────────────────────────────

export interface ReplyInput {
  storeId: string;
  conversationId: string;
  body: string;
  authorName: string;
  kind?: "text" | "auto_reply";
  /** Extra details kept on the message (e.g. { bot: true } for the chatbot, { rule } for a keyword reply). */
  meta?: Record<string, string | boolean | null>;
  /** WhatsApp only: send this list or button message; `body` is what the inbox shows. */
  interactive?: WhatsAppInteractive | null;
}

async function deliver(store: StoreRef, conversation: { id: string; channel: string; externalThreadId: string; contactEmail: string | null; contactPhone: string | null; subject: string | null; visitorSeenAt: Date | null; lastInboundAt: Date | null }, body: string, sellerEmail: string | null, interactive?: WhatsAppInteractive | null): Promise<SendResult & { via?: string }> {
  const channel = conversation.channel as InboxChannelKey;
  const base = { body, store: { id: store.id, name: store.name, slug: store.slug } };

  if (channel === "livechat") {
    // The widget polls for replies. If the shopper has left the page, also email the reply when we can.
    const away = !conversation.visitorSeenAt || Date.now() - conversation.visitorSeenAt.getTime() > LIVECHAT_EMAIL_AFTER_MS;
    if (away && conversation.contactEmail) {
      const emailed = await sendInboxEmail({ ...base, to: conversation.contactEmail, subject: `Your chat with ${store.name}`, credentials: {}, replyTo: sellerEmail });
      return emailed.ok ? { ok: true, externalId: emailed.externalId, via: "livechat+email" } : { ok: true, externalId: null, via: "livechat" };
    }
    return { ok: true, externalId: null, via: "livechat" };
  }

  if (channel === "email" || channel === "form") {
    if (conversation.contactEmail) {
      const subject = conversation.subject ?? (channel === "form" ? `Your message to ${store.name}` : null);
      return { ...(await sendInboxEmail({ ...base, to: conversation.contactEmail, subject, credentials: {}, replyTo: sellerEmail })), via: "email" };
    }
    if (channel === "form" && conversation.contactPhone) {
      const sms = await getChannel(store.id, "sms");
      if (sms) return { ...(await sendSmsReply({ ...base, to: conversation.contactPhone, credentials: sms.credentials })), via: "sms" };
    }
    return { ok: false, error: "This person didn't leave an email address, so there's no way to reply here." };
  }

  if (channel === "voice") {
    const sms = await getChannel(store.id, "sms");
    if (!sms || !conversation.contactPhone) return { ok: false, error: "Connect SMS to text callers back, or call them back." };
    return { ...(await sendSmsReply({ ...base, to: conversation.contactPhone, credentials: sms.credentials })), via: "sms" };
  }

  // WhatsApp only takes free-form messages within 24h of the customer's last message; say so instead of trying.
  if (channel === "whatsapp" && !withinServiceWindow(conversation.lastInboundAt)) return { ok: false, error: WINDOW_CLOSED_ERROR };

  if (channel === "tiktok") return { ok: false, error: "TikTok doesn't let apps reply to messages yet. Reply in the TikTok app." };

  const connected = await getChannel(store.id, channel);
  if (!connected) return { ok: false, error: `${CHANNELS[channel].label} isn't connected. Connect it in Inbox → Channels.` };
  const input = { ...base, to: conversation.externalThreadId, credentials: connected.credentials };
  switch (channel) {
    case "whatsapp": {
      const sent = await sendWhatsApp({ ...input, interactive: interactive ?? null });
      if (!sent.ok && sent.error === TOKEN_ERROR) await markChannelError(connected.row.id, TOKEN_ERROR);
      return { ...sent, via: "whatsapp" };
    }
    case "sms":
      return { ...(await sendSmsReply(input)), via: "sms" };
    case "messenger":
    case "instagram":
      return { ...(await sendMetaMessage(input)), via: channel };
    case "telegram":
      return { ...(await sendTelegram(input)), via: "telegram" };
    default:
      return { ok: false, error: "This channel can't send replies." };
  }
}

/** Sends a reply on the conversation's own channel and records it (sent or failed, never pretend). */
export async function sendReply(input: ReplyInput) {
  const body = input.body.trim().slice(0, 4000);
  if (!body) return { ok: false as const, error: "Write a message first." };
  const [store, conversation] = await Promise.all([
    storeById(input.storeId),
    db.inboxConversation.findFirst({ where: { id: input.conversationId, storeId: input.storeId } }),
  ]);
  if (!store || !conversation) return { ok: false as const, error: "Conversation not found." };
  const seller = await db.user.findUnique({ where: { id: store.userId }, select: { email: true } });

  const message = await db.inboxMessage.create({
    data: { conversationId: conversation.id, storeId: store.id, direction: "outbound", kind: input.kind ?? "text", body, status: "queued", authorName: input.authorName },
  });
  const result = await deliver(store, conversation, body, seller?.email ?? null, input.interactive).catch((error: Error) => ({ ok: false as const, error: error.message || "Sending failed." }));
  const saved = await db.inboxMessage.update({
    where: { id: message.id },
    data: result.ok
      ? { status: "sent", externalId: result.externalId, meta: { via: "via" in result ? result.via ?? null : null, ...(input.meta ?? {}) } }
      : { status: "failed", error: result.error.slice(0, 300), ...(input.meta ? { meta: input.meta } : {}) },
  });
  await db.inboxConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: saved.createdAt,
      lastMessagePreview: previewText(body),
      unreadCount: 0,
      ...(input.kind === "auto_reply" ? { autoRepliedAt: new Date() } : {}),
    },
  });
  return result.ok ? { ok: true as const, message: saved } : { ok: false as const, error: result.error, message: saved };
}

/** A private note or a manual call log. Never sent to the customer. */
export async function addNote(input: { storeId: string; conversationId: string; body: string; authorName: string; kind?: "text" | "call"; meta?: Record<string, unknown> }) {
  const conversation = await db.inboxConversation.findFirst({ where: { id: input.conversationId, storeId: input.storeId }, select: { id: true } });
  if (!conversation) return null;
  return db.inboxMessage.create({
    data: {
      conversationId: conversation.id,
      storeId: input.storeId,
      direction: "note",
      kind: input.kind ?? "text",
      body: input.body.trim().slice(0, 4000),
      status: "logged",
      authorName: input.authorName,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
}

// ─── Away auto-reply and Peggy ───────────────────────────────────────────────

async function storeFacts(storeId: string) {
  const [store, products] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { name: true, description: true, city: true, country: true, currency: true, slug: true } }),
    db.storeProduct.findMany({
      where: { storeId, status: "published" },
      orderBy: { soldStock: "desc" },
      take: 30,
      select: { name: true, retailPrice: true, currentStock: true },
    }).catch(() => []),
  ]);
  if (!store) return "";
  return [
    `Shop: ${store.name}${store.city ? ` in ${store.city}` : ""}${store.country ? `, ${store.country}` : ""}. Currency ${store.currency}.`,
    store.description ? `About: ${store.description.slice(0, 400)}` : "",
    products.length ? `Products (name, price, stock): ${products.map((p) => `${p.name} ${Math.round(Number(p.retailPrice))} ${p.currentStock > 0 ? "in stock" : "out of stock"}`).join("; ")}` : "",
    `Store link: ${(process.env.NEXT_PUBLIC_APP_URL ?? "https://app.shopinbos.com").replace(/\/$/, "")}/s/${store.slug}`,
  ].filter(Boolean).join("\n");
}

async function threadForAi(storeId: string, conversationId: string) {
  const messages = await db.inboxMessage.findMany({
    where: storeThreadWhere(storeId, conversationId),
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { direction: true, body: true },
  });
  return messages.reverse().map((m) => `${m.direction === "inbound" ? "Customer" : "Shop"}: ${m.body.slice(0, 1200)}`).join("\n");
}

/** Peggy's draft reply to the latest customer message. Never sends. Null when no AI provider is configured. */
export async function draftReplyWithPeggy(storeId: string, conversationId: string, extra?: { order?: string; instruction?: string | null }) {
  const [facts, thread] = await Promise.all([storeFacts(storeId), threadForAi(storeId, conversationId)]);
  if (!thread) return null;
  const result = await aiText({
    fast: true,
    system:
      "You are Peggy, writing a reply for a small online shop in Nigeria to send to a customer. Warm, brief, plain Nigerian English. " +
      "Only use facts from the shop details and the conversation; never invent prices, stock, delivery times, discounts or policies. If you don't know, say the shop will confirm. " +
      "Return only the message text, no greeting line like 'Subject:', no signature placeholders, no emojis unless the customer used them.",
    prompt: `${facts}\n${extra?.order ? `${extra.order}\n` : ""}\nConversation (oldest first):\n${thread}\n\n${extra?.instruction ? `The seller wants: ${extra.instruction}\n` : ""}Write the shop's next reply.`,
  });
  return result?.text.trim() || null;
}

const BOT_TAG = "needs-human";
const BOT_REPLIES_PER_HOUR = 20;

/**
 * Automatic replies to a new customer message: the storefront chatbot on live chat, keyword quick replies,
 * the away message (outside business hours, or while the seller is away) and the instant "got it". Away and
 * "got it" go out at most once per conversation every 12 hours; each keyword reply once per 12 hours.
 */
async function maybeAutoReply(conversationId: string) {
  const conversation = await db.inboxConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;
  const [settings, automation, lastInbound] = await Promise.all([
    db.inboxSettings.findUnique({ where: { storeId: conversation.storeId } }),
    loadAutomation(conversation.storeId),
    db.inboxMessage.findFirst({ where: { conversationId, direction: "inbound" }, orderBy: { createdAt: "desc" }, select: { body: true, externalId: true, meta: true } }),
  ]);
  const channel = conversation.channel as InboxChannelKey;
  const canReply = Boolean(CHANNELS[channel]?.replies && !(channel === "form" && !conversation.contactEmail));
  const sellerOnline = isSellerOnline(settings?.sellerLastSeenAt);
  const { autoReply: rules, chatbot: bot } = automation;
  const since = new Date(Date.now() - AUTO_REPLY_COOLDOWN_MS);

  // Peggy on WhatsApp has her own switch; when she doesn't answer, the usual auto-replies below still apply.
  if (channel === "whatsapp" && bot.whatsapp.mode !== "off" && lastInbound) {
    if (await maybeWhatsAppBot(conversation, automation, sellerOnline, lastInbound)) return;
  }

  // The chatbot: live chat only, in its hours, not after a hand-off, quiet while the seller is replying by hand.
  let botActive = false;
  if (channel === "livechat" && bot.enabled && !conversation.tags.includes(BOT_TAG) && chatbotOnDuty(bot, rules, sellerOnline)) {
    const [sellerReplied, botReplies] = await Promise.all([
      db.inboxMessage.count({ where: { conversationId, direction: "outbound", kind: "text", createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } }),
      db.inboxMessage.count({ where: { conversationId, direction: "outbound", kind: "auto_reply", createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } }),
    ]);
    botActive = !sellerReplied && botReplies < BOT_REPLIES_PER_HOUR;
  }

  const recentKeywords = rules.keywordsEnabled
    ? await db.inboxMessage
        .findMany({ where: { conversationId, direction: "outbound", kind: "auto_reply", createdAt: { gte: since } }, select: { meta: true }, take: 50 })
        .then((rows) => rows.map((row) => (row.meta as { rule?: unknown } | null)?.rule).filter((rule): rule is string => typeof rule === "string"))
        .catch(() => [])
    : [];

  const decision = decideAutoReply({
    // With the chatbot on but no AI key, live chat still gets keyword replies and the away message.
    enabled: Boolean(settings?.autoReplyEnabled) || (botActive && !hasAiProvider()),
    mode: settings?.autoReplyMode === "peggy" ? "peggy" : "message",
    awayMessage: settings?.awayMessage ?? null,
    rules: botActive && !hasAiProvider() ? { ...rules, keywordsEnabled: true } : rules,
    channel,
    channelReplies: canReply,
    message: lastInbound?.body ?? "",
    sellerOnline,
    lastAutoReplyAt: conversation.autoRepliedAt,
    chatbot: botActive && hasAiProvider(),
    recentKeywordIds: recentKeywords,
  });
  if (!decision) return;
  const base = { storeId: conversation.storeId, conversationId: conversation.id, kind: "auto_reply" as const };

  if (decision.kind === "chatbot") {
    const history = await db.inboxMessage.findMany({ where: { conversationId, direction: { in: ["inbound", "outbound"] }, status: { not: "failed" } }, orderBy: { createdAt: "desc" }, take: 12, select: { direction: true, body: true } });
    const answer = await chatbotAnswer(conversation.storeId, bot, rules, history.reverse().map((m) => ({ from: m.direction === "inbound" ? "shopper" : "shop", body: m.body })));
    await sendReply({ ...base, body: answer.reply, authorName: `${bot.name} (chatbot)`, meta: { bot: true, source: answer.source } });
    if (answer.handoff) await handOff(conversation.storeId, conversation.id, conversation.tags, lastInbound?.body ?? "");
    return;
  }
  if (decision.kind === "keyword") {
    await sendReply({ ...base, body: decision.body, authorName: "Quick reply", meta: { rule: decision.ruleId } });
    return;
  }
  if (decision.kind === "ack") {
    await sendReply({ ...base, body: decision.body, authorName: "Auto-reply" });
    return;
  }
  let body = decision.body;
  if (decision.peggy) {
    const drafted = await draftReplyWithPeggy(conversation.storeId, conversation.id, {
      instruction: "The owner is away right now. Answer what you can from the shop details, and say the owner will follow up soon.",
    }).catch(() => null);
    if (drafted) body = drafted;
  }
  await sendReply({ ...base, body, authorName: decision.peggy ? "Peggy (auto-reply)" : "Auto-reply" });
}

/**
 * Peggy on the seller's WhatsApp: answers when switched on (live, or test mode for the seller's own number), in
 * her hours, inside the 24h window, not after a hand-off, quiet for a while after the seller replies by hand, and
 * within hourly limits. Taps on her lists and buttons come back as reply ids. Returns false when she stays quiet.
 */
async function maybeWhatsAppBot(
  conversation: { id: string; storeId: string; externalThreadId: string; tags: string[]; lastInboundAt: Date | null },
  automation: Awaited<ReturnType<typeof loadAutomation>>,
  sellerOnline: boolean,
  lastInbound: { body: string; externalId: string | null; meta: Prisma.JsonValue },
) {
  const { chatbot: bot, autoReply: rules } = automation;
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  const [sellerReply, botReplies, storeBotReplies, earlierOutbound] = await Promise.all([
    db.inboxMessage.findFirst({ where: { conversationId: conversation.id, direction: "outbound", kind: "text" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.inboxMessage.count({ where: { conversationId: conversation.id, direction: "outbound", kind: "auto_reply", createdAt: { gte: hourAgo } } }),
    db.inboxMessage.count({ where: { storeId: conversation.storeId, direction: "outbound", kind: "auto_reply", createdAt: { gte: hourAgo }, meta: { path: ["channelBot"], equals: "whatsapp" } } }).catch(() => 0),
    db.inboxMessage.count({ where: { conversationId: conversation.id, direction: "outbound" } }),
  ]);
  const gate = whatsAppBotGate({
    settings: bot.whatsapp,
    from: conversation.externalThreadId,
    handedOff: conversation.tags.includes(BOT_TAG),
    onDuty: chatbotOnDuty({ enabled: true, when: bot.whatsapp.when }, rules, sellerOnline),
    lastInboundAt: conversation.lastInboundAt,
    sellerRepliedAt: sellerReply?.createdAt ?? null,
    botRepliesLastHour: botReplies,
    storeBotRepliesLastHour: storeBotReplies,
  });
  if (!gate.answer) return false;
  const connected = await getChannel(conversation.storeId, "whatsapp");
  if (!connected) return false;

  const history = await db.inboxMessage.findMany({ where: { ...storeThreadWhere(conversation.storeId, conversation.id), status: { not: "failed" } }, orderBy: { createdAt: "desc" }, take: 12, select: { direction: true, body: true } });
  const replyId = (lastInbound.meta as { replyId?: unknown } | null)?.replyId;
  const reply = await whatsappBotAnswer(conversation.storeId, bot, rules, history.reverse().map((m) => ({ from: m.direction === "inbound" ? "shopper" : "shop", body: m.body })), {
    replyId: typeof replyId === "string" ? replyId : null,
    phone: conversation.externalThreadId,
    firstMessage: earlierOutbound === 0,
  });
  void markWhatsAppRead(connected.credentials, lastInbound.externalId).catch(() => null);

  const base = { storeId: conversation.storeId, conversationId: conversation.id, kind: "auto_reply" as const, authorName: `${bot.name} (WhatsApp bot${gate.test ? ", test" : ""})` };
  const meta = { bot: true, channelBot: "whatsapp", source: reply.source, test: gate.test };
  let sent = await sendReply({ ...base, body: reply.body, interactive: reply.interactive, meta });
  // A list or button message can fail on its own (e.g. a product photo Meta can't fetch): try once as plain text.
  if (!sent.ok && reply.interactive && sent.error !== TOKEN_ERROR && sent.error !== WINDOW_CLOSED_ERROR) sent = await sendReply({ ...base, body: reply.body, meta: { ...meta, fallback: true } });
  if (!sent.ok) await markChannelError(connected.row.id, `Peggy couldn't reply on WhatsApp: ${sent.error}`);

  if (reply.orderRequest) {
    await addNote({ storeId: conversation.storeId, conversationId: conversation.id, authorName: bot.name, body: `Order request on WhatsApp: ${reply.orderRequest.name} (${reply.orderRequest.price}). Confirm the quantity, delivery and payment with the customer.`, meta: { orderRequest: reply.orderRequest } });
    await db.inboxConversation.update({ where: { id: conversation.id }, data: { tags: [...new Set([...conversation.tags, "order-request"])].slice(0, 10) } }).catch(() => null);
    const store = await storeById(conversation.storeId);
    if (store) {
      await createNotification({
        userId: store.userId,
        type: "customers",
        priority: "warning",
        title: "New order request on WhatsApp",
        description: `${reply.orderRequest.name} (${reply.orderRequest.price}). Peggy asked for the quantity and delivery area.`,
        link: `/home/messages?c=${conversation.id}`,
        actionLabel: "Reply",
        actionUrl: `/home/messages?c=${conversation.id}`,
        metadata: { source: "whatsapp-bot", conversationId: conversation.id },
      }).catch((error) => console.error("[inbox] order request notification failed", error));
    }
  }
  if (reply.handoff) await handOff(conversation.storeId, conversation.id, conversation.tags, lastInbound.body, "whatsapp");
  return true;
}

/** The chatbot stops on this conversation and the seller is told a shopper wants a person. */
async function handOff(storeId: string, conversationId: string, tags: string[], lastMessage: string, channel: "livechat" | "whatsapp" = "livechat") {
  await db.inboxConversation.update({ where: { id: conversationId }, data: { tags: [...new Set([...tags, BOT_TAG])].slice(0, 10), status: "open" } }).catch(() => null);
  const store = await storeById(storeId);
  if (!store) return;
  await createNotification({
    userId: store.userId,
    type: "customers",
    priority: "warning",
    title: channel === "whatsapp" ? "A WhatsApp customer wants to talk to you" : "A shopper wants to talk to you",
    description: previewText(lastMessage) || (channel === "whatsapp" ? "Peggy handed a WhatsApp chat over to you." : "Peggy handed a live chat over to you."),
    link: `/home/messages?c=${conversationId}`,
    actionLabel: "Reply",
    actionUrl: `/home/messages?c=${conversationId}`,
    metadata: { source: "chatbot", conversationId },
  }).catch((error) => console.error("[inbox] hand-off notification failed", error));
}

// ─── Customer sidebar ────────────────────────────────────────────────────────

const PAID = new Set<string>(PAID_ORDER_STATUSES);

/** Orders and spend for the person behind a conversation, matched by email or the last 10 digits of their phone. */
export async function customerSummary(storeId: string, contact: { email: string | null; phone: string | null }) {
  const or: Prisma.RetailOrderWhereInput[] = [];
  if (contact.email) or.push({ buyerEmail: { equals: contact.email, mode: "insensitive" } });
  const digits = contact.phone?.replace(/\D/g, "") ?? "";
  if (digits.length >= 10) or.push({ buyerPhone: { endsWith: digits.slice(-10) } });
  if (!or.length) return { matched: false, orders: [], orderCount: 0, totalSpent: 0, firstOrderAt: null as string | null };
  const orders = await db.retailOrder.findMany({
    where: { storeId, OR: or },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, orderNumber: true, total: true, status: true, createdAt: true, currency: true },
  });
  const paid = orders.filter((o) => PAID.has(o.status));
  return {
    matched: orders.length > 0,
    orders: orders.slice(0, 6).map((o) => ({ id: o.id, orderNumber: o.orderNumber, total: Number(o.total), status: o.status, createdAt: o.createdAt.toISOString() })),
    orderCount: orders.length,
    totalSpent: paid.reduce((sum, o) => sum + Number(o.total), 0),
    firstOrderAt: orders.length ? orders[orders.length - 1].createdAt.toISOString() : null,
  };
}

export async function touchSellerSeen(storeId: string) {
  await db.inboxSettings.upsert({ where: { storeId }, create: { storeId, sellerLastSeenAt: new Date() }, update: { sellerLastSeenAt: new Date() } }).catch(() => null);
}
