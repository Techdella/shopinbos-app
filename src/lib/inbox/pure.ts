// The inbox's pure parts: channel list, signature checks for every webhook, and the normalisers that turn
// each provider's payload into one inbound-message shape. No server imports (only node:crypto), so they
// are unit-tested in tests/behaviour.test.mjs.

import { createHmac, timingSafeEqual } from "node:crypto";

export * from "./meta.ts";

// ─── Small text helpers ──────────────────────────────────────────────────────

/** One-line preview for the conversation list. */
export function previewText(body: string, max = 140) {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** "+234 801 234 5678", "whatsapp:+2348012345678", "2348012345678" → "+2348012345678". Null when it isn't a number. */
export function normalisePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).replace(/^(whatsapp|tel|sms):/i, "").trim();
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  // A Nigerian local number typed with the trunk zero.
  if (!raw.startsWith("+") && digits.length === 11 && digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function normaliseEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = String(value).trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

/** "Ada Obi <ada@x.com>" → { name: "Ada Obi", email: "ada@x.com" }. */
export function parseEmailAddress(value: string | null | undefined): { name: string | null; email: string | null } {
  if (!value) return { name: null, email: null };
  const match = String(value).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim() || null, email: normaliseEmail(match[2]) };
  return { name: null, email: normaliseEmail(value) };
}

/** Removes the quoted history a mail client adds under a reply ("On Mon, X wrote:" and "> " lines). */
export function stripQuotedReply(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*On .+wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^\s*From: .+/i.test(line) && out.length > 0) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n").trim() || text.trim();
}

/** Plain text from an HTML email body (for previews and when no text part was sent). */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ─── Signature checks ────────────────────────────────────────────────────────

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Meta (WhatsApp Cloud API, Messenger, Instagram): X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export function verifyMetaSignature(rawBody: string, header: string | null | undefined, appSecret: string | null | undefined) {
  if (!header || !appSecret) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return safeEqual(header.trim(), expected);
}

/** Telegram: setWebhook's secret_token comes back in X-Telegram-Bot-Api-Secret-Token on every update. */
export function verifyTelegramSecret(header: string | null | undefined, secret: string | null | undefined) {
  if (!header || !secret) return false;
  return safeEqual(header, secret);
}

/**
 * Svix (Resend webhooks): signature over "<svix-id>.<svix-timestamp>.<body>" with the base64 key after "whsec_".
 * The header holds one or more "v1,<base64>" entries; any match passes. Rejects timestamps over 5 minutes off.
 */
export function verifySvixSignature(
  headers: { id: string | null | undefined; timestamp: string | null | undefined; signature: string | null | undefined },
  rawBody: string,
  secret: string | null | undefined,
  now = Date.now(),
) {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret) return false;
  const seconds = Number(headers.timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${rawBody}`, "utf8").digest("base64");
  return headers.signature
    .split(" ")
    .map((part) => part.split(",")[1] ?? "")
    .some((candidate) => candidate && safeEqual(candidate, expected));
}

/** Generic inbound email relays (Cloudflare Email Workers, Postmark, Mailgun scripts): hex HMAC-SHA256 of the body. */
export function verifyHmacHex(rawBody: string, header: string | null | undefined, secret: string | null | undefined) {
  if (!header || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.trim().replace(/^sha256=/, ""), expected);
}

// ─── Store scoping ───────────────────────────────────────────────────────────

/**
 * The message filter for reading a conversation's thread (for Peggy's drafts and the WhatsApp bot). Always
 * scoped to the store as well as the conversation, so a conversation id from elsewhere can't read another
 * store's messages. Throws on a missing id rather than widening the query.
 */
export function storeThreadWhere(storeId: string, conversationId: string) {
  if (!storeId || !conversationId) throw new Error("storeThreadWhere needs a store id and a conversation id");
  return { storeId, conversationId, direction: { in: ["inbound", "outbound"] } };
}

// ─── Normalised inbound shape ────────────────────────────────────────────────

export interface InboundAttachment {
  type: string;
  url?: string | null;
  mediaId?: string | null;
  name?: string | null;
  contentType?: string | null;
}

export interface InboundMessage {
  /** Provider id of the account that received it (phone_number_id, Page id, IG id, SMS number). */
  accountId: string;
  /** Who the conversation is with, in the provider's terms (phone, PSID, chat id). */
  threadId: string;
  externalId: string | null;
  text: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactHandle?: string | null;
  attachments: InboundAttachment[];
  timestamp: Date;
  /** WhatsApp: the id of the button or list row the customer tapped (ours, e.g. "p:<productId>"). */
  replyId?: string | null;
}

export interface StatusUpdate {
  externalId: string;
  accountId?: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string | null;
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

function fromUnixSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

const WHATSAPP_MEDIA = ["image", "audio", "video", "document", "sticker"] as const;

/** WhatsApp Cloud API webhook → messages and delivery statuses, per business phone number. */
export function parseWhatsAppWebhook(payload: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const accountId = str(asRecord(value.metadata).phone_number_id);
      const names = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const c = asRecord(contact);
        names.set(str(c.wa_id), str(asRecord(c.profile).name));
      }
      for (const raw of asArray(value.messages)) {
        const m = asRecord(raw);
        const from = str(m.from);
        if (!from) continue;
        const type = str(m.type);
        const attachments: InboundAttachment[] = [];
        let text = "";
        let replyId: string | null = null;
        if (type === "text") text = str(asRecord(m.text).body);
        else if (type === "button") {
          // A quick-reply button on a template message.
          text = str(asRecord(m.button).text);
          replyId = str(asRecord(m.button).payload) || null;
        } else if (type === "interactive") {
          const interactive = asRecord(m.interactive);
          const reply = asRecord(interactive.button_reply).id ? asRecord(interactive.button_reply) : asRecord(interactive.list_reply);
          text = str(reply.title);
          replyId = str(reply.id).slice(0, 256) || null;
        } else if (type === "location") {
          const loc = asRecord(m.location);
          text = `Shared a location: ${str(loc.name) || `${str(loc.latitude)}, ${str(loc.longitude)}`}`;
        } else if ((WHATSAPP_MEDIA as readonly string[]).includes(type)) {
          const media = asRecord(m[type]);
          attachments.push({ type, mediaId: str(media.id) || null, name: str(media.filename) || null, contentType: str(media.mime_type) || null });
          text = str(media.caption);
        } else if (type === "reaction") {
          text = `Reacted ${str(asRecord(m.reaction).emoji)}`;
        }
        if (!text && !attachments.length) text = `[${type || "unsupported"} message]`;
        messages.push({
          accountId,
          threadId: normalisePhone(from) ?? from,
          externalId: str(m.id) || null,
          text,
          contactName: names.get(from) || null,
          contactPhone: normalisePhone(from),
          attachments,
          timestamp: fromUnixSeconds(m.timestamp),
          replyId,
        });
      }
      for (const raw of asArray(value.statuses)) {
        const s = asRecord(raw);
        const status = str(s.status);
        if (!str(s.id) || !["sent", "delivered", "read", "failed"].includes(status)) continue;
        const error = asRecord(asArray(s.errors)[0]);
        statuses.push({ externalId: str(s.id), accountId, status: status as StatusUpdate["status"], error: str(error.title) || str(error.message) || null });
      }
    }
  }
  return { messages, statuses };
}

/** Account-level errors Meta puts in a WhatsApp webhook (value.errors), per business phone number. */
export function parseWhatsAppWebhookErrors(payload: unknown): Array<{ accountId: string; message: string }> {
  const out: Array<{ accountId: string; message: string }> = [];
  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const accountId = str(asRecord(value.metadata).phone_number_id);
      for (const raw of asArray(value.errors)) {
        const e = asRecord(raw);
        const message = str(asRecord(e.error_data).details) || str(e.message) || str(e.title);
        if (accountId && message) out.push({ accountId, message: message.slice(0, 200) });
      }
    }
  }
  return out;
}

/** Messenger (object "page") and Instagram (object "instagram") webhooks → inbound messages. Echoes of our own sends are skipped. */
export function parseMetaMessagingWebhook(payload: unknown): { channel: "messenger" | "instagram"; messages: InboundMessage[] } {
  const body = asRecord(payload);
  const channel = body.object === "instagram" ? "instagram" : "messenger";
  const messages: InboundMessage[] = [];
  for (const entry of asArray(body.entry)) {
    const e = asRecord(entry);
    const accountId = str(e.id);
    for (const raw of asArray(e.messaging)) {
      const event = asRecord(raw);
      const message = asRecord(event.message);
      if (!Object.keys(message).length || message.is_echo) continue;
      const senderId = str(asRecord(event.sender).id);
      if (!senderId || senderId === accountId) continue;
      const attachments: InboundAttachment[] = asArray(message.attachments).map((item) => {
        const a = asRecord(item);
        return { type: str(a.type) || "file", url: str(asRecord(a.payload).url) || null };
      });
      const text = str(message.text) || (attachments.length ? "" : "[unsupported message]");
      messages.push({
        accountId: accountId || str(asRecord(event.recipient).id),
        threadId: senderId,
        externalId: str(message.mid) || null,
        text,
        contactHandle: senderId,
        attachments,
        timestamp: event.timestamp ? new Date(Number(event.timestamp)) : new Date(),
      });
    }
  }
  return { channel, messages };
}

/** Telegram Bot API update → inbound message (private chats and groups; edits are ignored). */
export function parseTelegramUpdate(update: unknown): InboundMessage | null {
  const message = asRecord(asRecord(update).message);
  const chat = asRecord(message.chat);
  const chatId = str(chat.id);
  if (!chatId) return null;
  const from = asRecord(message.from);
  const name = [str(from.first_name), str(from.last_name)].filter(Boolean).join(" ") || str(chat.title) || null;
  const attachments: InboundAttachment[] = [];
  const photos = asArray(message.photo);
  if (photos.length) attachments.push({ type: "image", mediaId: str(asRecord(photos[photos.length - 1]).file_id) || null });
  for (const kind of ["document", "voice", "audio", "video", "sticker"]) {
    const media = asRecord(message[kind]);
    if (str(media.file_id)) attachments.push({ type: kind, mediaId: str(media.file_id), name: str(media.file_name) || null, contentType: str(media.mime_type) || null });
  }
  const contact = asRecord(message.contact);
  const text = str(message.text) || str(message.caption) || (str(contact.phone_number) ? `Shared a phone number: ${str(contact.phone_number)}` : "");
  return {
    accountId: "",
    threadId: chatId,
    externalId: str(message.message_id) ? `${chatId}:${str(message.message_id)}` : null,
    text: text || (attachments.length ? "" : "[unsupported message]"),
    contactName: name,
    contactHandle: str(from.username) ? `@${str(from.username)}` : null,
    contactPhone: normalisePhone(str(contact.phone_number)),
    attachments,
    timestamp: fromUnixSeconds(message.date),
  };
}

export interface InboundEmail {
  fromEmail: string;
  fromName: string | null;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  messageId: string | null;
  attachments: InboundAttachment[];
}

/** A received email (Resend's receiving API object, or a generic relay's JSON) → one inbound email. */
export function normaliseInboundEmail(raw: unknown): InboundEmail | null {
  const e = asRecord(raw);
  const from = parseEmailAddress(str(e.from) || str(asRecord(e.from).address));
  if (!from.email) return null;
  const to = (Array.isArray(e.to) ? e.to.map(str) : [str(e.to)]).flatMap((item) => item.split(",")).map((item) => parseEmailAddress(item).email).filter((item): item is string => Boolean(item));
  const html = str(e.html) || null;
  const text = str(e.text) || (html ? htmlToText(html) : "");
  return {
    fromEmail: from.email,
    fromName: from.name ?? (str(e.from_name) || null),
    to,
    subject: str(e.subject).slice(0, 300),
    text: stripQuotedReply(text).slice(0, 20000),
    html,
    messageId: str(e.message_id) || str(e.messageId) || str(e.id) || null,
    attachments: asArray(e.attachments).map((item) => {
      const a = asRecord(item);
      return { type: "file", name: str(a.filename) || str(a.name) || null, contentType: str(a.content_type) || str(a.contentType) || null, mediaId: str(a.id) || null };
    }),
  };
}

/** The store slug in an inbound address like "adas-closet@inbox.shopinbos.com" (only on the given inbox domain). */
export function storeSlugFromAddress(addresses: string[], domain: string | null | undefined) {
  if (!domain) return null;
  const wanted = domain.trim().toLowerCase();
  for (const address of addresses) {
    const [local, host] = address.toLowerCase().split("@");
    if (host === wanted && local) return local.split("+")[0];
  }
  return null;
}

// ─── Live chat, away and auto-reply ──────────────────────────────────────────

export const SELLER_ONLINE_MS = 5 * 60_000;
export const AUTO_REPLY_COOLDOWN_MS = 12 * 60 * 60_000;

/** The seller counts as online while their inbox has been open in the last 5 minutes. */
export function isSellerOnline(lastSeenAt: Date | string | null | undefined, now = new Date()) {
  if (!lastSeenAt) return false;
  return now.getTime() - new Date(lastSeenAt).getTime() < SELLER_ONLINE_MS;
}

/** One automatic "we're away" reply per conversation every 12 hours, only while the seller is offline. */
export function shouldAutoReply(input: { enabled: boolean; sellerLastSeenAt: Date | string | null | undefined; lastAutoReplyAt: Date | string | null | undefined; channelReplies: boolean }, now = new Date()) {
  if (!input.enabled || !input.channelReplies) return false;
  if (isSellerOnline(input.sellerLastSeenAt, now)) return false;
  if (input.lastAutoReplyAt && now.getTime() - new Date(input.lastAutoReplyAt).getTime() < AUTO_REPLY_COOLDOWN_MS) return false;
  return true;
}

/** Tags typed by the seller: trimmed, lower-case, unique, at most 10 of 30 characters. */
export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const tag of tags) {
    const value = String(tag ?? "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
    if (value && !out.includes(value)) out.push(value);
    if (out.length >= 10) break;
  }
  return out;
}

