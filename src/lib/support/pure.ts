import { z } from "zod";

// Live support (signed-out "Stuck?" form, in-app chat, admin support desk): rules and helpers with no
// database or React, shared by the API, the widgets, the admin desk and tests (Node strips the types natively).

export const SUPPORT_EMAIL = "support@shopinbos.com";

export const TOPICS = [
  { value: "login", label: "Can't log in" },
  { value: "payments", label: "Payments" },
  { value: "store", label: "My store" },
  { value: "orders", label: "Orders" },
  // "We'll set it up for you": connecting another system, a web address, feeds and other technical jobs.
  { value: "setup", label: "Set something up for me" },
  { value: "other", label: "Something else" },
] as const;
export type SupportTopic = (typeof TOPICS)[number]["value"];
export const TOPIC_VALUES = TOPICS.map((topic) => topic.value) as [SupportTopic, ...SupportTopic[]];

/** open: waiting on us · pending: waiting on the customer · solved: answered (reopens on a reply) · closed: done. */
export const STATUSES = ["open", "pending", "solved", "closed"] as const;
export type SupportStatus = (typeof STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof PRIORITIES)[number];

export const PORTALS = ["public", "seller", "supplier", "logistics_partner", "admin"] as const;
export type SupportPortal = (typeof PORTALS)[number];

export type AuthorType = "user" | "agent" | "ai" | "system";

export const STATUS_LABEL: Record<SupportStatus, string> = { open: "Open", pending: "Waiting on customer", solved: "Solved", closed: "Closed" };
export const PRIORITY_LABEL: Record<SupportPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const PORTAL_LABEL: Record<SupportPortal, string> = { public: "Signed out", seller: "Seller", supplier: "Supplier", logistics_partner: "Delivery partner", admin: "Admin" };

export function topicLabel(topic: string) {
  return TOPICS.find((item) => item.value === topic)?.label ?? "Something else";
}

// ─── Ticket numbers ───────────────────────────────────────────────────────────

/** Human ticket reference: 1042 → "SB-1042". */
export function formatTicketNumber(number: number) {
  return `SB-${number}`;
}

/** "SB-1042", "sb1042", "#SB-1042" or "1042" → 1042; anything else → null. */
export function parseTicketNumber(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const match = String(raw).trim().match(/^#?(?:sb-?)?(\d{1,9})$/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Finds the ticket a reply email belongs to: "support+SB-1042@…" in To, else "[SB-1042]" in the subject. */
export function ticketNumberFromEmail(email: { to: string[]; subject: string }): number | null {
  for (const address of email.to) {
    const tag = address.toLowerCase().match(/^[^@+]+\+sb-?(\d{1,9})@/);
    if (tag) return Number(tag[1]);
  }
  const subject = email.subject.match(/\[?\bSB-(\d{1,9})\b\]?/i);
  return subject ? Number(subject[1]) : null;
}

/** Is this email addressed to the support inbox (support@ or support+anything@ on that domain)? */
export function addressedToSupport(to: string[], inbox: string) {
  const [local, domain] = inbox.toLowerCase().split("@");
  if (!local || !domain) return false;
  return to.some((address) => {
    const [toLocal, toDomain] = address.toLowerCase().split("@");
    return toDomain === domain && (toLocal === local || toLocal?.startsWith(`${local}+`));
  });
}

/** The address replies should go to so they thread back into the ticket. */
export function replyAddress(inbox: string, number: number) {
  const [local, domain] = inbox.split("@");
  return local && domain ? `${local}+${formatTicketNumber(number).toLowerCase()}@${domain}` : inbox;
}

/**
 * Keeps only the new part of an emailed reply: drops everything from the first quote header ("On … wrote:",
 * "-----Original Message-----", "From: …" after a blank line) or quoted ">" block onwards.
 */
export function stripQuotedReply(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^On .{4,200}wrote:?$/i.test(trimmed)) break;
    // Gmail wraps the "On … wrote:" header over two lines.
    if (/^On .{4,200}$/i.test(trimmed) && /wrote:?$/i.test(lines[i + 1]?.trim() ?? "")) break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed)) break;
    if (/^_{5,}$/.test(trimmed)) break;
    if (/^From: .+/i.test(trimmed) && kept.length && !kept[kept.length - 1].trim()) break;
    if (trimmed.startsWith(">")) {
      if (lines.slice(i).every((rest) => !rest.trim() || rest.trim().startsWith(">"))) break;
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").trim();
}

// ─── Text, files and spam ─────────────────────────────────────────────────────

export const MESSAGE_MAX = 5000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] as const;

export interface SupportAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function sanitizeText(raw: unknown, max = MESSAGE_MAX) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Why a file can't be attached, or null when it's fine. */
export function attachmentProblem(file: { type: string; size: number }) {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return "Attach a screenshot (JPG, PNG, WebP, GIF) or a PDF.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Files can be up to 10 MB.";
  return null;
}

/** WhatsApp files to the team's number: any kind people send (voice notes, videos, documents), up to 50 MB. */
export const WHATSAPP_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** Why a WhatsApp file can't be kept (only empty or too big: every type is welcome), or null. */
export function whatsappAttachmentProblem(file: { size: number }) {
  if (file.size <= 0) return "That file is empty.";
  if (file.size > WHATSAPP_MAX_ATTACHMENT_BYTES) return "Files can be up to 50 MB.";
  return null;
}

/** Types a browser would run (pages, scripts, SVG) are kept as plain downloads instead. */
export function whatsappStoredType(type: string) {
  const clean = type.toLowerCase().split(";")[0]!.trim();
  if (!clean || /html|javascript|ecmascript|svg|xml/.test(clean)) return "application/octet-stream";
  return clean;
}

export function safeFileName(name: string) {
  const cleaned = name.replace(INVISIBLE, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 120);
}

/** Stored files live under support/<ticketId>/; anything else is not this ticket's file. */
export function attachmentPathBelongs(path: string, ticketId: string) {
  return path.startsWith(`support/${ticketId}/`) && !path.includes("..") && !path.includes("//");
}

export function asAttachments(value: unknown): SupportAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.path !== "string" || typeof row.name !== "string") return [];
    return [{ path: row.path, name: row.name, type: typeof row.type === "string" ? row.type : "application/octet-stream", size: typeof row.size === "number" ? row.size : 0 }];
  });
}

/** Bots fill every field, and fill forms faster than people can. */
export const MIN_FILL_MS = 2500;

export function looksLikeSpam(input: { honeypot?: unknown; startedAt?: unknown; now?: number; message?: string }) {
  if (typeof input.honeypot === "string" && input.honeypot.trim()) return true;
  const started = Number(input.startedAt);
  const now = input.now ?? Date.now();
  if (Number.isFinite(started) && started > 0 && now - started < MIN_FILL_MS) return true;
  // Link farms: lots of URLs and little else.
  const links = (input.message ?? "").match(/https?:\/\//gi)?.length ?? 0;
  return links >= 4;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The signed-out "Stuck?" form. Needs an email or a phone so we can reply. */
export const publicRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Tell us your name.").max(120),
    contact: z.string().trim().min(3, "Add an email or phone number so we can reply.").max(160),
    topic: z.enum(TOPIC_VALUES),
    message: z.string().trim().min(5, "Tell us a little more so we can help.").max(MESSAGE_MAX),
    path: z.string().max(300).optional(),
  })
  .superRefine((value, ctx) => {
    if (!EMAIL.test(value.contact) && !PHONE.test(value.contact)) ctx.addIssue({ code: "custom", path: ["contact"], message: "That doesn't look like an email or phone number." });
  });

/** Splits the single "email or phone" field. */
export function splitContact(contact: string): { email: string | null; phone: string | null } {
  const value = contact.trim();
  if (EMAIL.test(value)) return { email: value.toLowerCase(), phone: null };
  const digits = value.replace(/[^\d+]/g, "");
  return { email: null, phone: digits.startsWith("+") ? digits : digits.replace(/^0/, "+234") };
}

export const createTicketSchema = z.object({
  topic: z.enum(TOPIC_VALUES),
  message: z.string().trim().min(1, "Type a message first.").max(MESSAGE_MAX),
  subject: z.string().trim().max(160).optional(),
  path: z.string().max(300).optional(),
  /** The Peggy conversation before "Talk to a person", so the team doesn't ask again. */
  transcript: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(30)
    .optional(),
});

export const replySchema = z.object({ message: z.string().trim().max(MESSAGE_MAX).default("") });

export const ratingSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() });

export const agentReplySchema = z.object({
  message: z.string().trim().max(MESSAGE_MAX).default(""),
  internal: z.boolean().default(false),
  /** Status to set with the reply (Zendesk-style "Submit as solved"). */
  status: z.enum(STATUSES).optional(),
  macroId: z.string().max(64).optional(),
  /** Peggy's draft, sent as Peggy (Admin › Inbox). */
  asPeggy: z.boolean().default(false),
});

export const ticketUpdateSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    topic: z.enum(TOPIC_VALUES).optional(),
    /** A user id, "me", or null to unassign. */
    assigneeId: z.string().max(64).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), "Nothing to change.");

export const bulkUpdateSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(100),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().max(64).nullable().optional(),
});

export const macroSchema = z.object({
  title: z.string().trim().min(1, "Give the reply a name.").max(80),
  body: z.string().trim().min(1, "Write the reply.").max(MESSAGE_MAX),
  topic: z.enum(TOPIC_VALUES).nullable().optional(),
  /** Status to set when the macro is used, e.g. solved. */
  status: z.enum(STATUSES).nullable().optional(),
});

/** Fills {{name}}, {{first_name}}, {{ticket}}, {{agent}} in a canned reply. Unknown tags are left as written. */
export function fillMacro(body: string, vars: { name?: string | null; ticket?: number; agent?: string | null }) {
  const first = (vars.name ?? "").trim().split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    name: vars.name?.trim() || "there",
    first_name: first || "there",
    ticket: vars.ticket ? formatTicketNumber(vars.ticket) : "",
    agent: vars.agent?.trim().split(/\s+/)[0] || "the Shopinbos team",
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) => values[key.toLowerCase()] ?? whole);
}

// ─── SLA and stats ────────────────────────────────────────────────────────────

/** How long the first human reply may take, by priority. The public promise is "usually within an hour". */
export const FIRST_RESPONSE_MINUTES: Record<SupportPriority, number> = { urgent: 15, high: 30, normal: 60, low: 240 };

export function firstResponseDue(createdAt: Date, priority: SupportPriority) {
  return new Date(createdAt.getTime() + FIRST_RESPONSE_MINUTES[priority] * 60_000);
}

/** Login and payment problems block people from working, so they start high. */
export function defaultPriority(topic: SupportTopic): SupportPriority {
  return topic === "login" || topic === "payments" ? "high" : "normal";
}

export type SlaState = { state: "met" | "ok" | "soon" | "overdue" | "none"; minutes: number };

/** Where a ticket stands against its first-response target. "soon" is the last quarter (at least 10 minutes). */
export function slaState(ticket: { firstResponseDueAt: Date | string | null; firstRespondedAt: Date | string | null; status: string }, now = Date.now()): SlaState {
  if (ticket.firstRespondedAt) return { state: "met", minutes: 0 };
  if (!ticket.firstResponseDueAt || ticket.status === "solved" || ticket.status === "closed") return { state: "none", minutes: 0 };
  const left = Math.round((new Date(ticket.firstResponseDueAt).getTime() - now) / 60_000);
  if (left < 0) return { state: "overdue", minutes: -left };
  return { state: left <= 10 ? "soon" : "ok", minutes: left };
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return `${Math.floor(hours / 24)}d`;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** CSAT as most help desks report it: share of ratings that are 4 or 5. */
export function csat(ratings: number[]) {
  if (!ratings.length) return { score: null as number | null, average: null as number | null, count: 0 };
  const happy = ratings.filter((rating) => rating >= 4).length;
  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
  return { score: Math.round((happy / ratings.length) * 100), average: Math.round(average * 10) / 10, count: ratings.length };
}

/** Unread for the customer: an agent replied after they last opened the ticket. */
export function hasUnread(lastReplyAt: Date | string | null | undefined, readAt: Date | string | null | undefined) {
  if (!lastReplyAt) return false;
  return !readAt || new Date(lastReplyAt).getTime() > new Date(readAt).getTime();
}

/** A one-line preview for lists and notifications. */
export function preview(text: string, max = 120) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** A subject from the first message when the customer didn't give one. */
export function subjectFrom(topic: SupportTopic, message: string) {
  const first = preview(message.split("\n").find((line) => line.trim()) ?? "", 80);
  return first || topicLabel(topic);
}
