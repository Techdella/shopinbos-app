import { z } from "zod";
import { OFF_PLATFORM_WARNING, offPlatformSignals } from "../../../shared/delivery-market.ts";
import { UPLOAD_MAX_BYTES } from "../../../shared/media.ts";

// Partner messages (seller ↔ supplier ↔ delivery partner): rules and helpers with no database or React,
// shared by the API, the Messages drawer, the full pages and tests (Node strips the types natively).

export type PartnerRole = "seller" | "supplier" | "logistics_partner" | "admin";
export type ConversationTab = "all" | "supplier" | "logistics_partner" | "seller";
export type ContextKind = "product" | "order" | "wholesale_order" | "booking";

export interface AttachmentRef {
  path: string;
  name: string;
  type: string;
  size: number;
}

/** What a linked product/order/booking looks like in the thread. A snapshot, so the card survives edits. */
export interface ContextSnapshot {
  kind: ContextKind;
  id: string;
  label: string;
  sub?: string | null;
  image?: string | null;
  /** Slug for products, so the card can link to the marketplace page. */
  slug?: string | null;
}

export interface ConversationSummary {
  id: string;
  with: { userId: string; name: string; role: PartnerRole; logoUrl: string | null; slug: string | null; city: string | null };
  lastMessage: { text: string; mine: boolean; createdAt: string; seen: boolean } | null;
  unread: number;
  updatedAt: string;
}

export interface ThreadAttachment {
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface ThreadMessage {
  id: string;
  mine: boolean;
  text: string;
  createdAt: string;
  read: boolean;
  readAt: string | null;
  attachments: ThreadAttachment[];
  context: ContextSnapshot | null;
  /** A gentle note when the text looks like taking a delivery job off the app (chats with a delivery partner). */
  warning?: string | null;
}

// ─── Who can talk to whom ─────────────────────────────────────────────────────

export const ROLE_LABEL: Record<PartnerRole, string> = {
  seller: "Seller",
  supplier: "Supplier",
  logistics_partner: "Delivery partner",
  admin: "Shopinbos",
};

export function roleLabel(role: string | null | undefined) {
  return ROLE_LABEL[(role ?? "seller") as PartnerRole] ?? "Member";
}

const PAIRS = new Set(["seller:supplier", "logistics_partner:seller", "logistics_partner:supplier"]);

/** B2B pairs only: seller ↔ supplier, seller ↔ delivery partner, supplier ↔ delivery partner. */
export function canMessage(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return PAIRS.has([a, b].sort().join(":"));
}

/** Conversation rows store the pair sorted, so one pair has one row. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ─── Text and files ───────────────────────────────────────────────────────────

export const MESSAGE_MAX = 4000;
export const MAX_ATTACHMENTS = 4;
/** Per file, after photos are shrunk in the browser: uploads over about 4.5 MB never reach the route (shared/media.ts). */
export const MAX_ATTACHMENT_BYTES = UPLOAD_MAX_BYTES;
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] as const;
/** Sends per person per minute, and per conversation per 10 seconds (stops paste-and-hold floods). */
export const SEND_LIMIT = { maxRequests: 20, windowMs: 60_000 };
export const BURST_LIMIT = { maxRequests: 6, windowMs: 10_000 };
/** Email the recipient when a message is still unread after this long. */
export const UNREAD_EMAIL_DELAY_MINUTES = 15;
/** How often an open thread and the drawer list check for new messages. */
export const POLL_MS = { thread: 4_000, list: 10_000, badge: 30_000 };

// Control characters other than tab/newline, zero-width characters and bidi overrides (used to disguise text).
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Plain text as people typed it: normalised newlines, no invisible/control characters, at most two blank
 * lines in a row, trimmed and capped. Never HTML: the UI renders it as text and emails escape it.
 */
export function sanitizeMessageText(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MESSAGE_MAX);
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Why a file can't be attached, or null when it's fine. */
export function attachmentProblem(file: { type: string; size: number }) {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return "Attach a photo (JPG, PNG, WebP, GIF) or a PDF.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Files can be up to 4 MB.";
  return null;
}

/** Uploaded files live under messages/<conversationId>/ in storage; anything else is someone else's file. */
export function attachmentPathBelongs(path: string, conversationId: string) {
  return path.startsWith(`messages/${conversationId}/`) && !path.includes("..") && !path.includes("//");
}

export function safeFileName(name: string) {
  const cleaned = name.replace(INVISIBLE, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 120);
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export const contextRefSchema = z.object({
  kind: z.enum(["product", "order", "wholesale_order", "booking"]),
  id: z.string().trim().min(1).max(64),
});
export type ContextRef = z.infer<typeof contextRefSchema>;

export const attachmentSchema = z.object({
  path: z.string().min(1).max(300),
  name: z.string().max(200).transform(safeFileName),
  type: z.enum(ATTACHMENT_TYPES),
  size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});

export const sendMessageSchema = z
  .object({
    text: z.string().max(MESSAGE_MAX * 2).optional().default("").transform(sanitizeMessageText),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional().default([]),
    context: contextRefSchema.nullish(),
    clientId: z.string().max(64).optional(),
  })
  .refine((value) => value.text.length > 0 || value.attachments.length > 0 || Boolean(value.context), {
    message: "Write a message, attach a file or link something first.",
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const startConversationSchema = z.object({
  with: z.string().trim().min(1).max(64),
});

export const listQuerySchema = z.object({
  tab: z.enum(["all", "supplier", "logistics_partner", "seller"]).catch("all"),
  q: z.string().max(80).optional().transform((value) => (value ?? "").trim()),
});

export const threadQuerySchema = z.object({
  after: z.iso.datetime({ offset: true }).optional().catch(undefined),
  before: z.iso.datetime({ offset: true }).optional().catch(undefined),
});

// ─── Previews, grouping and filters ───────────────────────────────────────────

const CONTEXT_NOUN: Record<ContextKind, string> = { product: "a product", order: "an order", wholesale_order: "a wholesale order", booking: "a delivery" };

/** One-line preview for the conversation list and notifications. */
export function messagePreview(message: { text: string; attachments?: Array<{ type: string }> | null; context?: { kind: ContextKind; label?: string } | null }) {
  const text = message.text.replace(/\s+/g, " ").trim();
  if (text) return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  const files = message.attachments ?? [];
  if (files.length) {
    const photos = files.filter((file) => file.type.startsWith("image/")).length;
    if (photos === files.length) return photos === 1 ? "Sent a photo" : `Sent ${photos} photos`;
    return files.length === 1 ? "Sent a PDF" : `Sent ${files.length} files`;
  }
  if (message.context) return `Shared ${CONTEXT_NOUN[message.context.kind]}${message.context.label ? `: ${message.context.label}` : ""}`;
  return "";
}

const LAGOS = "Africa/Lagos";

/** Calendar day in Lagos time ("2026-10-12"), so separators don't jump at UTC midnight. */
export function dayKey(iso: string, timeZone = LAGOS) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function dayLabel(iso: string, now = new Date(), timeZone = LAGOS) {
  const key = dayKey(iso, timeZone);
  if (key === dayKey(now.toISOString(), timeZone)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timeZone)) return "Yesterday";
  const sameYear = key.slice(0, 4) === dayKey(now.toISOString(), timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(iso));
}

export function groupByDay<T extends { createdAt: string }>(messages: T[], now = new Date()) {
  const groups: Array<{ key: string; label: string; items: T[] }> = [];
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(message);
    else groups.push({ key, label: dayLabel(message.createdAt, now), items: [message] });
  }
  return groups;
}

export function filterConversations<T extends { with: { name: string; role: string }; lastMessage: { text: string } | null }>(items: T[], tab: ConversationTab, q = "") {
  const needle = q.trim().toLowerCase();
  return items.filter((item) => {
    if (tab !== "all" && item.with.role !== tab) return false;
    if (!needle) return true;
    return item.with.name.toLowerCase().includes(needle) || (item.lastMessage?.text ?? "").toLowerCase().includes(needle);
  });
}

/** Merge a poll's messages into what's on screen: by id, oldest first, keeping messages still being sent. */
export function mergeMessages<T extends { id: string; createdAt: string }>(current: T[], incoming: T[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** "Seen" goes under the newest of my messages the other person has read, like most messengers. */
export function lastSeenId(messages: Array<{ id: string; mine: boolean; read: boolean }>) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.mine && message.read) return message.id;
  }
  return null;
}

/** Whether an unread message is due its "you have a message" email. */
export function shouldEmailUnread(message: { createdAt: Date; read: boolean; emailedAt: Date | null }, now = new Date(), delayMinutes = UNREAD_EMAIL_DELAY_MINUTES) {
  if (message.read || message.emailedAt) return false;
  const age = now.getTime() - message.createdAt.getTime();
  return age >= delayMinutes * 60_000 && age <= 3 * 86_400_000;
}

// ─── Off-app guardrail ────────────────────────────────────────────────────────

/**
 * The gentle in-chat note (never a block) when a message in a chat with a delivery partner shares a phone number,
 * bank account, email, or asks to be paid directly (shared/delivery-market.ts offPlatformSignals). Null otherwise.
 */
export function offPlatformNote(text: string | null | undefined, roles: ReadonlyArray<string | null | undefined>): string | null {
  if (!text || !roles.includes("logistics_partner")) return null;
  return offPlatformSignals(text).length ? OFF_PLATFORM_WARNING : null;
}

// ─── Quick replies ────────────────────────────────────────────────────────────

export function quickReplies(myRole: string, theirRole: string): string[] {
  const pair = `${myRole}>${theirRole}`;
  switch (pair) {
    case "seller>supplier":
      return ["Is this in stock?", "Can you do a better price for 50 units?", "How long does delivery take?", "Can I get a sample first?"];
    case "seller>logistics_partner":
      return ["When will the rider pick up?", "How much to deliver this?", "Is the parcel on its way?", "Can you collect payment on delivery?"];
    case "supplier>seller":
      return ["Yes, it's in stock.", "I can do a better price on bulk orders.", "Your order ships today.", "Thanks for your order!"];
    case "supplier>logistics_partner":
      return ["When can you pick up?", "The parcel is ready for pickup.", "How much for this route?"];
    case "logistics_partner>seller":
    case "logistics_partner>supplier":
      return ["The rider is on the way.", "Picked up, delivering today.", "Delivered.", "Please confirm the pickup address."];
    default:
      return [];
  }
}

// ─── Links ────────────────────────────────────────────────────────────────────

export const MESSAGES_PATH: Record<PartnerRole, string> = {
  seller: "/home/messages/partners",
  supplier: "/supplier/inbox",
  logistics_partner: "/logistics/inbox",
  admin: "/admin",
};

/**
 * Link to the messages page that opens a chat. `with` is a user id, supplier id or delivery partner id;
 * `context` pre-attaches a product/order/booking card to the first message.
 * e.g. messagesHref("seller", { with: supplier.id, context: { kind: "product", id: product.id } })
 *   → /home/messages/partners?with=…&ctx=product:…
 */
export function messagesHref(role: PartnerRole, options: { with?: string; conversation?: string; context?: ContextRef | null } = {}) {
  const params = new URLSearchParams();
  if (options.conversation) params.set("c", options.conversation);
  if (options.with) params.set("with", options.with);
  if (options.context) params.set("ctx", `${options.context.kind}:${options.context.id}`);
  const query = params.toString();
  return `${MESSAGES_PATH[role] ?? MESSAGES_PATH.seller}${query ? `?${query}` : ""}`;
}

/** Reads `ctx=product:abc` from a messages link. */
export function parseContextParam(value: string | null | undefined): ContextRef | null {
  if (!value) return null;
  const index = value.indexOf(":");
  if (index < 1) return null;
  const parsed = contextRefSchema.safeParse({ kind: value.slice(0, index), id: value.slice(index + 1) });
  return parsed.success ? parsed.data : null;
}

/** Where a context card links for the person looking at it. */
export function contextHref(viewerRole: string, context: ContextSnapshot) {
  switch (context.kind) {
    case "product":
      if (viewerRole === "supplier") return `/supplier/products/${context.id}/edit`;
      return context.slug ? `/marketplace/product/${context.slug}` : null;
    case "order":
      return viewerRole === "seller" ? `/home/orders/${context.id}` : null;
    case "wholesale_order":
      return viewerRole === "supplier" ? `/supplier/orders?q=${encodeURIComponent(context.id.slice(0, 8))}` : null;
    case "booking":
      if (viewerRole === "logistics_partner") return `/logistics/bookings?q=${encodeURIComponent(context.label)}`;
      return viewerRole === "seller" ? "/home/logistics" : null;
    default:
      return null;
  }
}

export function formatMoney(amount: number, currency = "NGN") {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString("en-NG");
  return currency === "NGN" ? `₦${rounded}` : `${currency} ${rounded}`;
}

/** "in_transit" → "In transit" */
export function statusLabel(status: string) {
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
