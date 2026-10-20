import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/inbox/pure";
import { getPublicEnv } from "@/lib/env";
import { createNotification } from "@/lib/notifications/create";
import { isEmailConfigured, sendEmail } from "@/lib/notifications/resend";
import { sendSms } from "@/lib/notifications/service";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { uploadPrivateFile } from "@/lib/supabase/storage.server";
import { startOfLagosDay } from "@/lib/dashboard/compute";
import {
  MAX_ATTACHMENTS,
  PORTALS,
  SUPPORT_EMAIL,
  asAttachments,
  attachmentPathBelongs,
  attachmentProblem,
  csat,
  defaultPriority,
  fillMacro,
  firstResponseDue,
  formatTicketNumber,
  hasUnread,
  median,
  preview,
  safeFileName,
  sanitizeText,
  subjectFrom,
  topicLabel,
  type AuthorType,
  type SupportAttachment,
  type SupportPortal,
  type SupportPriority,
  type SupportStatus,
  type SupportTopic,
} from "./pure";
import { agentReplyEmail, newConversationEmail, newTicketEmail, receivedEmail, replyAddressFor, supportInbox } from "./email.server";
import { downloadInboxMedia, findTeamTemplate, sendInboxTemplate, sendInboxText } from "./whatsapp.server";
import { queuePeggyAutoReply } from "./peggy.server";

/** The agent id Peggy's own auto-replies use (not a user). */
export const PEGGY_ID = "peggy";
import { isStopMessage, renderTeamTemplate, teamTemplateProblem, whatsappPhone, whatsappWindowOpen } from "./whatsapp-pure";

// Live support: tickets, threads, notifications and the admin desk's queries. Everything degrades when
// docs/migrations/2026-10-12-support.sql hasn't run yet (supportReady() is false): see each caller.

export type Viewer = { id: string; role: string; name: string; email: string | null; phone?: string | null };

export class SupportError extends Error {
  constructor(
    public code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "RATE_LIMITED" | "NOT_READY",
    message: string,
  ) {
    super(message);
  }
  get status() {
    return { NOT_FOUND: 404, FORBIDDEN: 403, BAD_REQUEST: 400, RATE_LIMITED: 429, NOT_READY: 503 }[this.code];
  }
}

// ─── Are the tables there yet? ────────────────────────────────────────────────

let ready: boolean | null = null;
let readyCheckedAt = 0;

export async function supportReady() {
  if (ready) return true;
  if (ready === false && Date.now() - readyCheckedAt < 60_000) return false;
  try {
    const rows = await db.$queryRaw<Array<{ ok: boolean }>>`SELECT to_regclass('public."SupportTicket"') IS NOT NULL AND to_regclass('public."SupportMessage"') IS NOT NULL AS ok`;
    ready = Boolean(rows[0]?.ok);
  } catch {
    ready = false;
  }
  readyCheckedAt = Date.now();
  return ready;
}

async function requireReady() {
  if (!(await supportReady())) throw new SupportError("NOT_READY", "Support tickets need a quick database update first.");
}

function appBase() {
  return getPublicEnv().appUrl.replace(/\/$/, "");
}

function portalOf(role: string | null | undefined): SupportPortal {
  return (PORTALS as readonly string[]).includes(role ?? "") ? (role as SupportPortal) : "public";
}

/** Where a signed-in person reads replies: their portal home with ?support=1042 opens the chat on that ticket. */
export function ticketLinkFor(portal: string, number: number) {
  const home = portal === "supplier" ? "/supplier/dashboard" : portal === "logistics_partner" ? "/logistics/dashboard" : portal === "admin" ? "/admin/dashboard" : "/home";
  return `${appBase()}${home}?support=${number}`;
}

// ─── Files ────────────────────────────────────────────────────────────────────

export function filesProblem(files: File[]) {
  if (files.length > MAX_ATTACHMENTS) return `Attach up to ${MAX_ATTACHMENTS} files.`;
  for (const file of files) {
    const problem = attachmentProblem(file);
    if (problem) return problem;
  }
  return null;
}

async function storeFiles(ticketId: string, files: File[]): Promise<SupportAttachment[]> {
  const stored: SupportAttachment[] = [];
  for (const file of files.slice(0, MAX_ATTACHMENTS)) {
    const { path } = await uploadPrivateFile(`support/${ticketId}`, file);
    stored.push({ path, name: safeFileName(file.name), type: file.type, size: file.size });
  }
  return stored;
}

export interface MessageView {
  id: string;
  authorType: AuthorType;
  authorName: string | null;
  body: string;
  internal: boolean;
  channel: string;
  attachments: Array<{ name: string; type: string; size: number; url: string }>;
  createdAt: Date;
  /** WhatsApp messages the team sent: sent | delivered | read | failed. */
  deliveryStatus?: string | null;
  deliveryError?: string | null;
}

function messageView(number: number, row: { id: string; authorType: string; authorName: string | null; body: string; internal: boolean; channel: string; attachments: unknown; createdAt: Date; deliveryStatus?: string | null; deliveryError?: string | null }): MessageView {
  return {
    id: row.id,
    authorType: row.authorType as AuthorType,
    authorName: row.authorName,
    body: row.body,
    internal: row.internal,
    channel: row.channel,
    attachments: asAttachments(row.attachments).map((file, index) => ({ name: file.name, type: file.type, size: file.size, url: `/api/support/tickets/${number}/files/${row.id}/${index}` })),
    createdAt: row.createdAt,
    deliveryStatus: row.deliveryStatus ?? null,
    deliveryError: row.deliveryError ?? null,
  };
}

/** The file behind an attachment link, if the viewer may see it: their own ticket (not internal notes) or an admin. */
export async function attachmentFor(viewer: Viewer, number: number, messageId: string, index: number) {
  await requireReady();
  const ticket = await db.supportTicket.findUnique({ where: { number }, select: { id: true, userId: true } });
  if (!ticket) return null;
  const isAdmin = viewer.role === "admin";
  if (!isAdmin && ticket.userId !== viewer.id) return null;
  const message = await db.supportMessage.findFirst({ where: { id: messageId, ticketId: ticket.id, ...(isAdmin ? {} : { internal: false }) }, select: { attachments: true } });
  const file = asAttachments(message?.attachments)[index];
  if (!file || !attachmentPathBelongs(file.path, ticket.id)) return null;
  return file;
}

// ─── Creating tickets ─────────────────────────────────────────────────────────

interface NewTicket {
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  portal: SupportPortal;
  topic: SupportTopic;
  subject?: string;
  message: string;
  source: "app" | "web" | "email" | "whatsapp";
  path?: string;
  meta?: Record<string, unknown>;
  files?: File[];
  externalId?: string | null;
}

async function openTicket(input: NewTicket) {
  const now = new Date();
  const priority = defaultPriority(input.topic);
  const body = sanitizeText(input.message);
  const ticket = await db.supportTicket.create({
    data: {
      userId: input.userId,
      name: input.name.slice(0, 120) || "Someone",
      email: input.email,
      phone: input.phone,
      portal: input.portal,
      topic: input.topic,
      subject: (input.subject?.trim() || subjectFrom(input.topic, body)).slice(0, 160),
      priority,
      source: input.source,
      path: input.path?.slice(0, 300) || null,
      firstResponseDueAt: firstResponseDue(now, priority),
      lastMessageAt: now,
      lastUserMessageAt: now,
      userReadAt: now,
      meta: (input.meta ?? {}) as Prisma.InputJsonValue,
    },
  });
  // Files go under the ticket's own folder, so they're stored once the ticket exists.
  const attachments = input.files?.length ? await storeFiles(ticket.id, input.files).catch(() => []) : [];
  try {
    await db.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorType: "user",
        authorId: input.userId,
        authorName: input.name,
        body,
        attachments: attachments as unknown as Prisma.InputJsonValue,
        channel: input.source,
        externalId: input.externalId ?? null,
      },
    });
  } catch (error) {
    // e.g. a concurrent replay of the same inbound email (unique externalId): don't leave an empty ticket behind.
    await db.supportTicket.delete({ where: { id: ticket.id } }).catch(() => null);
    throw error;
  }
  void notifyAdminsOfTicket(ticket, body, attachments.length, "new").catch(() => null);
  return ticket;
}

/**
 * The signed-out "Stuck?" form. Returns the ticket number, or null when the tables aren't there yet; then the
 * request is emailed to the support inbox so nobody is left without an answer.
 */
export async function createPublicRequest(input: {
  name: string;
  email: string | null;
  phone: string | null;
  topic: SupportTopic;
  message: string;
  path?: string;
  files: File[];
  ip: string;
  userAgent: string | null;
}) {
  if (!(await supportReady())) {
    const sent = await sendEmail({
      to: [supportInbox()],
      subject: `[Support] ${topicLabel(input.topic)} from ${input.name}`,
      html: newTicketEmail({ number: null, name: input.name, email: input.email, phone: input.phone, topic: input.topic, portal: "public", subject: subjectFrom(input.topic, input.message), body: input.message, files: input.files.length, link: null }),
      replyTo: input.email ?? undefined,
    }).catch(() => ({ success: false }));
    if (!sent.success) throw new SupportError("NOT_READY", `We couldn't send that just now. Email ${SUPPORT_EMAIL} and a person will reply.`);
    return { number: null as number | null };
  }

  // Match an existing account for the desk's context panel only: a signed-out form can't prove who sent it,
  // so it never lands in that account's in-app history.
  const matched = input.email
    ? await db.user.findUnique({ where: { email: input.email }, select: { id: true, role: true } }).catch(() => null)
    : input.phone
      ? await db.user.findFirst({ where: { phone: input.phone }, select: { id: true, role: true } }).catch(() => null)
      : null;

  const ticket = await openTicket({
    userId: null,
    name: input.name,
    email: input.email,
    phone: input.phone,
    portal: "public",
    topic: input.topic,
    message: input.message,
    source: "web",
    path: input.path,
    files: input.files,
    meta: { matchedUserId: matched?.id ?? null, matchedRole: matched?.role ?? null, ip: input.ip, userAgent: input.userAgent?.slice(0, 300) ?? null },
  });
  if (input.email && isEmailConfigured()) {
    void sendEmail({
      to: [input.email],
      subject: `We've got it: ${formatTicketNumber(ticket.number)} · ${ticket.subject}`,
      html: receivedEmail({ name: input.name, number: ticket.number, body: input.message }),
      replyTo: replyAddressFor(ticket.number),
    }).catch(() => null);
  }
  return { number: ticket.number as number | null };
}

/** "Talk to a person" in the app. */
export async function createTicket(viewer: Viewer, input: { topic: SupportTopic; message: string; subject?: string; path?: string; transcript?: Array<{ role: string; content: string }>; files: File[] }) {
  await requireReady();
  const ticket = await openTicket({
    userId: viewer.id,
    name: viewer.name,
    email: viewer.email,
    phone: viewer.phone ?? null,
    portal: portalOf(viewer.role),
    topic: input.topic,
    subject: input.subject,
    message: input.message,
    source: "app",
    path: input.path,
    files: input.files,
    meta: input.transcript?.length ? { transcript: input.transcript.slice(-20) } : {},
  });
  return getMyTicket(viewer, ticket.number);
}

// ─── The customer's side ──────────────────────────────────────────────────────

export interface TicketSummary {
  id: string;
  number: number;
  subject: string;
  topic: string;
  status: SupportStatus;
  lastMessageAt: Date;
  unread: boolean;
  preview: string;
  rating: number | null;
}

export async function listMyTickets(viewer: Viewer): Promise<TicketSummary[]> {
  if (!(await supportReady())) return [];
  const rows = await db.supportTicket.findMany({
    where: { userId: viewer.id },
    orderBy: { lastMessageAt: "desc" },
    take: 30,
    select: {
      id: true, number: true, subject: true, topic: true, status: true, lastMessageAt: true, lastAgentMessageAt: true, userReadAt: true, rating: true,
      messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorType: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    subject: row.subject,
    topic: row.topic,
    status: row.status as SupportStatus,
    lastMessageAt: row.lastMessageAt,
    unread: hasUnread(row.lastAgentMessageAt, row.userReadAt),
    preview: preview(row.messages[0] ? `${row.messages[0].authorType === "user" ? "You: " : ""}${row.messages[0].body}` : row.subject, 90),
    rating: row.rating,
  }));
}

export async function unreadCount(viewer: Viewer) {
  if (!(await supportReady())) return 0;
  const rows = await db.supportTicket.findMany({
    where: { userId: viewer.id, lastAgentMessageAt: { not: null } },
    orderBy: { lastAgentMessageAt: "desc" },
    take: 50,
    select: { lastAgentMessageAt: true, userReadAt: true },
  });
  return rows.filter((row) => hasUnread(row.lastAgentMessageAt, row.userReadAt)).length;
}

export async function getMyTicket(viewer: Viewer, number: number, options: { markRead?: boolean } = {}) {
  await requireReady();
  const ticket = await db.supportTicket.findUnique({
    where: { number },
    select: {
      id: true, number: true, userId: true, subject: true, topic: true, status: true, createdAt: true, lastMessageAt: true, assigneeId: true,
      rating: true, ratingComment: true, firstRespondedAt: true, lastAgentMessageAt: true, userReadAt: true,
      messages: { where: { internal: false }, orderBy: { createdAt: "asc" }, take: 300, select: { id: true, authorType: true, authorName: true, body: true, internal: true, channel: true, attachments: true, createdAt: true } },
    },
  });
  if (!ticket || ticket.userId !== viewer.id) throw new SupportError("NOT_FOUND", "We couldn't find that conversation.");
  if (options.markRead && hasUnread(ticket.lastAgentMessageAt, ticket.userReadAt)) {
    await db.supportTicket.update({ where: { id: ticket.id }, data: { userReadAt: new Date() } }).catch(() => null);
  }
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    topic: ticket.topic,
    status: ticket.status as SupportStatus,
    createdAt: ticket.createdAt,
    rating: ticket.rating,
    ratingComment: ticket.ratingComment,
    answered: Boolean(ticket.firstRespondedAt),
    messages: ticket.messages.map((row) => messageView(ticket.number, row)),
  };
}

export type MyTicket = Awaited<ReturnType<typeof getMyTicket>>;

/** A customer's reply in the app. Reopens a solved or waiting ticket. */
export async function addUserMessage(viewer: Viewer, number: number, text: string, files: File[]) {
  await requireReady();
  const ticket = await db.supportTicket.findUnique({ where: { number } });
  if (!ticket || ticket.userId !== viewer.id) throw new SupportError("NOT_FOUND", "We couldn't find that conversation.");
  const body = sanitizeText(text);
  if (!body && !files.length) throw new SupportError("BAD_REQUEST", "Type a message or attach a file.");
  if (ticket.status === "closed") throw new SupportError("BAD_REQUEST", "This conversation is closed. Start a new one and we'll pick it up.");
  await recordUserMessage(ticket, { body, files, authorId: viewer.id, authorName: viewer.name, channel: "app" });
  return getMyTicket(viewer, number, { markRead: true });
}

async function recordUserMessage(
  ticket: { id: string; number: number; status: string; assigneeId: string | null; subject: string; name: string; email: string | null; phone: string | null; portal: string; topic: string },
  input: { body: string; files: File[]; authorId: string | null; authorName: string; channel: "app" | "email" | "whatsapp"; externalId?: string | null },
) {
  const now = new Date();
  const attachments = input.files.length ? await storeFiles(ticket.id, input.files) : [];
  await db.supportMessage.create({
    data: {
      ticketId: ticket.id,
      authorType: "user",
      authorId: input.authorId,
      authorName: input.authorName,
      body: input.body,
      attachments: attachments as unknown as Prisma.InputJsonValue,
      channel: input.channel,
      externalId: input.externalId ?? null,
    },
  });
  const reopened = ticket.status === "solved" || ticket.status === "pending";
  await db.supportTicket.update({
    where: { id: ticket.id },
    data: { lastMessageAt: now, lastUserMessageAt: now, userReadAt: now, ...(reopened ? { status: "open", solvedAt: null } : {}) },
  });
  void notifyAdminsOfTicket(ticket, input.body, attachments.length, "reply").catch(() => null);
}

export async function rateTicket(viewer: Viewer, number: number, rating: number, comment?: string) {
  await requireReady();
  const ticket = await db.supportTicket.findUnique({ where: { number }, select: { id: true, userId: true, status: true } });
  if (!ticket || ticket.userId !== viewer.id) throw new SupportError("NOT_FOUND", "We couldn't find that conversation.");
  if (ticket.status !== "solved" && ticket.status !== "closed") throw new SupportError("BAD_REQUEST", "You can rate the help once the conversation is solved.");
  await db.supportTicket.update({ where: { id: ticket.id }, data: { rating, ratingComment: comment ? sanitizeText(comment, 1000) : null, ratedAt: new Date() } });
  return getMyTicket(viewer, number);
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function adminUsers() {
  // Removed team members (Admin › Team) don't get tickets.
  return db.user.findMany({ where: { role: "admin", OR: [{ adminRole: null }, { adminRole: { not: "disabled" } }] }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 50 });
}

/**
 * New tickets: an in-app notification for every admin and an email to SUPPORT_INBOX (or each admin when it
 * isn't set). Customer replies: the assignee only (everyone when unassigned), in-app.
 */
async function notifyAdminsOfTicket(
  ticket: { id: string; number: number; assigneeId: string | null; subject: string; name: string; email: string | null; phone: string | null; portal: string; topic: string },
  body: string,
  files: number,
  kind: "new" | "reply",
) {
  const admins = await adminUsers();
  const link = `/admin/support/${ticket.number}`;
  const ref = formatTicketNumber(ticket.number);
  const recipients = kind === "reply" && ticket.assigneeId ? admins.filter((admin) => admin.id === ticket.assigneeId) : admins;
  await Promise.all(
    recipients.map((admin) =>
      createNotification({
        userId: admin.id,
        type: "system",
        priority: kind === "new" ? "warning" : "info",
        title: kind === "new" ? `New support ticket ${ref}` : `${ticket.name} replied on ${ref}`,
        description: preview(body || "Sent a file", 160),
        link,
        actionLabel: "Open ticket",
        actionUrl: link,
        metadata: { supportTicket: ticket.number },
        event: "admin.review",
      }).catch(() => null),
    ),
  );
  if (kind !== "new" || !isEmailConfigured()) return;
  const to = process.env.SUPPORT_INBOX?.trim() ? [supportInbox()] : admins.flatMap((admin) => (admin.email ? [admin.email] : []));
  if (!to.length) return;
  await sendEmail({
    to,
    subject: `[${ref}] ${topicLabel(ticket.topic)}: ${ticket.subject}`,
    html: newTicketEmail({ number: ticket.number, name: ticket.name, email: ticket.email, phone: ticket.phone, topic: ticket.topic, portal: ticket.portal, subject: ticket.subject, body, files, link: `${appBase()}${link}` }),
  }).catch(() => null);
}

/** An agent's public reply reaches the customer: in-app (signed-in tickets), email, else SMS to their phone. */
async function deliverAgentReply(ticket: { id: string; number: number; userId: string | null; name: string; email: string | null; phone: string | null; portal: string; subject: string }, body: string, agentName: string) {
  const ref = formatTicketNumber(ticket.number);
  const account = ticket.userId ? await db.user.findUnique({ where: { id: ticket.userId }, select: { email: true, phone: true } }).catch(() => null) : null;
  const email = account?.email ?? ticket.email;
  const phone = account?.phone ?? ticket.phone;
  const link = ticket.userId ? ticketLinkFor(ticket.portal, ticket.number) : null;
  if (ticket.userId) {
    await createNotification({
      userId: ticket.userId,
      type: "system",
      priority: "info",
      title: `Shopinbos support replied (${ref})`,
      description: preview(body, 160),
      link: link?.replace(appBase(), ""),
      actionLabel: "Read reply",
      actionUrl: link?.replace(appBase(), ""),
      metadata: { supportTicket: ticket.number },
      event: "support.reply",
    }).catch(() => null);
  }
  if (email && isEmailConfigured()) {
    const sent = await sendEmail({
      to: [email],
      subject: `Re: [${ref}] ${ticket.subject}`,
      html: agentReplyEmail({ name: ticket.name, number: ticket.number, body, agentName, link }),
      replyTo: replyAddressFor(ticket.number),
    }).catch(() => ({ success: false }));
    if (sent.success) return "email" as const;
  }
  if (!email && phone) {
    const sms = await sendSms({ to: [phone], message: `Shopinbos support (${ref}): ${preview(body, 300)}${link ? ` Reply: ${link}` : ""}` }).catch(() => null);
    if (sms?.success) return "sms" as const;
  }
  return ticket.userId ? ("app" as const) : ("none" as const);
}

// ─── Admin desk ───────────────────────────────────────────────────────────────

export interface QueueFilters {
  status?: string; // open | pending | solved | closed | active | all
  priority?: string;
  topic?: string;
  portal?: string;
  channel?: string; // app | web | email | whatsapp (where the conversation started)
  assignee?: string; // me | none | <userId>
  q?: string;
  page?: number;
}

const ACTIVE = ["open", "pending"];

function queueWhere(filters: QueueFilters, agentId: string): Prisma.SupportTicketWhereInput {
  const where: Prisma.SupportTicketWhereInput = {};
  const status = filters.status ?? "active";
  if (status === "active") where.status = { in: ACTIVE };
  else if (status !== "all") where.status = status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.topic) where.topic = filters.topic;
  if (filters.portal) where.portal = filters.portal;
  if (filters.channel) where.source = filters.channel;
  if (filters.assignee === "me") where.assigneeId = agentId;
  else if (filters.assignee === "none") where.assigneeId = null;
  else if (filters.assignee) where.assigneeId = filters.assignee;
  const q = filters.q?.trim();
  if (q) {
    const number = Number(q.replace(/^#?sb-?/i, ""));
    where.OR = [
      ...(Number.isSafeInteger(number) && number > 0 ? [{ number }] : []),
      { subject: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

export const QUEUE_PAGE_SIZE = 50;

export async function supportQueue(agentId: string, filters: QueueFilters) {
  await requireReady();
  const where = queueWhere(filters, agentId);
  const page = Math.max(1, filters.page ?? 1);
  // Overdue and urgent first while the queue holds open work; most recent activity otherwise.
  const orderBy: Prisma.SupportTicketOrderByWithRelationInput[] =
    (filters.status ?? "active") === "active" || filters.status === "open"
      ? [{ firstRespondedAt: { sort: "asc", nulls: "first" } }, { firstResponseDueAt: { sort: "asc", nulls: "last" } }, { lastMessageAt: "desc" }]
      : [{ lastMessageAt: "desc" }];
  const [rows, total, byStatus, mine, unassigned] = await Promise.all([
    db.supportTicket.findMany({
      where,
      orderBy,
      skip: (page - 1) * QUEUE_PAGE_SIZE,
      take: QUEUE_PAGE_SIZE,
      select: {
        id: true, number: true, name: true, email: true, phone: true, subject: true, topic: true, portal: true, status: true, priority: true, source: true,
        assigneeId: true, firstResponseDueAt: true, firstRespondedAt: true, lastMessageAt: true, lastUserMessageAt: true, agentReadAt: true, createdAt: true, rating: true,
        messages: { where: { internal: false }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorType: true } },
      },
    }),
    db.supportTicket.count({ where }),
    db.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    db.supportTicket.count({ where: { assigneeId: agentId, status: { in: ACTIVE } } }),
    db.supportTicket.count({ where: { assigneeId: null, status: { in: ACTIVE } } }),
  ]);
  const admins = await adminUsers();
  const names = new Map(admins.map((admin) => [admin.id, admin.name]));
  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<string, number>;
  return {
    rows: rows.map((row) => ({
      ...row,
      assigneeName: row.assigneeId ? names.get(row.assigneeId) ?? "Someone" : null,
      unread: hasUnread(row.lastUserMessageAt, row.agentReadAt),
      preview: preview(row.messages[0]?.body ?? "", 110),
      lastFromCustomer: row.messages[0]?.authorType === "user",
    })),
    total,
    page,
    counts: { open: counts.open ?? 0, pending: counts.pending ?? 0, solved: counts.solved ?? 0, closed: counts.closed ?? 0, mine, unassigned },
    admins,
  };
}

export type QueueRow = Awaited<ReturnType<typeof supportQueue>>["rows"][number];

export async function supportStats(now = new Date()) {
  await requireReady();
  const today = startOfLagosDay(now);
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [open, pending, overdue, solvedToday, newToday, responded, rated] = await Promise.all([
    db.supportTicket.count({ where: { status: "open" } }),
    db.supportTicket.count({ where: { status: "pending" } }),
    db.supportTicket.count({ where: { status: { in: ACTIVE }, firstRespondedAt: null, firstResponseDueAt: { lt: now } } }),
    db.supportTicket.count({ where: { solvedAt: { gte: today } } }),
    db.supportTicket.count({ where: { createdAt: { gte: today } } }),
    db.supportTicket.findMany({ where: { createdAt: { gte: since }, firstRespondedAt: { not: null } }, select: { createdAt: true, firstRespondedAt: true }, take: 2000 }),
    db.supportTicket.findMany({ where: { ratedAt: { gte: since }, rating: { not: null } }, select: { rating: true }, take: 2000 }),
  ]);
  const minutes = responded.map((row) => Math.max(0, (row.firstRespondedAt!.getTime() - row.createdAt.getTime()) / 60_000));
  const medianMinutes = median(minutes);
  return {
    open,
    pending,
    overdue,
    solvedToday,
    newToday,
    medianFirstResponseMinutes: medianMinutes === null ? null : Math.round(medianMinutes),
    respondedCount: minutes.length,
    csat: csat(rated.map((row) => row.rating ?? 0)),
  };
}

export async function getTicketForAgent(number: number, agentId: string) {
  await requireReady();
  const ticket = await db.supportTicket.findUnique({
    where: { number },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 500 } },
  });
  if (!ticket) return null;
  if (hasUnread(ticket.lastUserMessageAt, ticket.agentReadAt)) {
    await db.supportTicket.update({ where: { id: ticket.id }, data: { agentReadAt: new Date() } }).catch(() => null);
  }
  const meta = (ticket.meta && typeof ticket.meta === "object" && !Array.isArray(ticket.meta) ? ticket.meta : {}) as Record<string, unknown>;
  const contextUserId = ticket.userId ?? (typeof meta.matchedUserId === "string" ? meta.matchedUserId : null);
  const [admins, context, previous] = await Promise.all([
    adminUsers(),
    contextUserId ? userContext(contextUserId).catch(() => null) : Promise.resolve(null),
    db.supportTicket.findMany({
      where: {
        id: { not: ticket.id },
        OR: [...(contextUserId ? [{ userId: contextUserId }] : []), ...(ticket.email ? [{ email: ticket.email }] : []), ...(ticket.phone ? [{ phone: ticket.phone }] : [])],
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { number: true, subject: true, status: true, createdAt: true },
    }),
  ]);
  const transcript = Array.isArray(meta.transcript) ? (meta.transcript as Array<{ role: string; content: string }>) : [];
  return {
    ticket: { ...ticket, messages: undefined },
    messages: ticket.messages.map((row) => messageView(ticket.number, row)),
    transcript,
    matchedByContact: !ticket.userId && Boolean(contextUserId),
    admins,
    context,
    previous,
  };
}

export type AgentTicket = NonNullable<Awaited<ReturnType<typeof getTicketForAgent>>>;

const PLAN_LABEL: Record<string, string> = { seller_growth: "Growth", seller_pro: "Pro", supplier_max: "Supplier Max" };

/** Who the customer is: role, business, plan, recent orders and last sign-in, for the desk's side panel. */
export async function userContext(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, supabaseId: true, name: true, email: true, phone: true, role: true, city: true, country: true, createdAt: true, verificationStatus: true,
      store: { select: { id: true, name: true, slug: true, status: true, customDomain: true } },
      supplier: { select: { id: true, displayName: true, verificationStatus: true } },
      logisticsPartner: { select: { id: true, displayName: true, verificationStatus: true } },
    },
  });
  if (!user) return null;
  const [receipt, retail, wholesale, bookings, lastSignIn] = await Promise.all([
    db.paymentReceipt.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { purpose: true, createdAt: true } }).catch(() => null),
    user.store
      ? db.retailOrder.findMany({ where: { storeId: user.store.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, orderNumber: true, total: true, currency: true, status: true, createdAt: true } })
      : Promise.resolve([]),
    user.supplier
      ? db.wholesaleOrder.findMany({ where: { supplierId: user.supplier.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, totalPrice: true, currency: true, status: true, createdAt: true } })
      : user.role === "seller"
        ? db.wholesaleOrder.findMany({ where: { sellerId: userId }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, totalPrice: true, currency: true, status: true, createdAt: true } })
        : Promise.resolve([]),
    user.logisticsPartner
      ? db.deliveryBooking.findMany({ where: { logisticsPartnerId: user.logisticsPartner.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, deliveryFee: true, currency: true, status: true, destination: true, createdAt: true } })
      : Promise.resolve([]),
    lastSignInAt(user.supabaseId),
  ]);
  const orders = [
    ...retail.map((row) => ({ id: row.id, label: row.orderNumber, kind: "Store order", amount: row.total, currency: row.currency, status: String(row.status), createdAt: row.createdAt })),
    ...wholesale.map((row) => ({ id: row.id, label: `WS-${row.id.slice(-6).toUpperCase()}`, kind: "Wholesale", amount: row.totalPrice, currency: row.currency, status: String(row.status), createdAt: row.createdAt })),
    ...bookings.map((row) => ({ id: row.id, label: row.destination.slice(0, 40), kind: "Delivery", amount: row.deliveryFee, currency: row.currency, status: String(row.status), createdAt: row.createdAt })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6);
  return {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role as string, city: user.city, country: user.country, createdAt: user.createdAt, verificationStatus: user.verificationStatus as string },
    business: user.store
      ? { kind: "Store", name: user.store.name, detail: user.store.customDomain ?? `${user.store.slug}.shopinbos.com`, status: user.store.status, href: `/s/${user.store.slug}` }
      : user.supplier
        ? { kind: "Supplier", name: user.supplier.displayName, detail: String(user.supplier.verificationStatus), status: String(user.supplier.verificationStatus), href: `/admin/suppliers/${user.supplier.id}` }
        : user.logisticsPartner
          ? { kind: "Delivery partner", name: user.logisticsPartner.displayName, detail: String(user.logisticsPartner.verificationStatus), status: String(user.logisticsPartner.verificationStatus), href: `/admin/logistics-partners/${user.logisticsPartner.id}` }
          : null,
    plan: receipt ? { label: PLAN_LABEL[receipt.purpose] ?? receipt.purpose, since: receipt.createdAt } : { label: "Free", since: null },
    orders,
    lastSignInAt: lastSignIn,
  };
}

async function lastSignInAt(supabaseId: string): Promise<Date | null> {
  try {
    const supabase = await getSupabaseServiceClient();
    const { data } = await supabase.auth.admin.getUserById(supabaseId);
    return data.user?.last_sign_in_at ? new Date(data.user.last_sign_in_at) : null;
  } catch {
    return null;
  }
}

/** An agent's reply (emailed and shown in-app) or internal note, optionally setting the status at the same time. */
/**
 * `asPeggy`: the reply is Peggy's (her draft, sent by someone on the team, or her own auto-reply when the agent is
 * { id: "peggy" }). It shows and is signed as Peggy; an auto-reply assigns nobody.
 */
export async function agentReply(agent: Viewer, ticketId: string, input: { message: string; internal: boolean; status?: SupportStatus; macroId?: string; files: File[]; asPeggy?: boolean }) {
  await requireReady();
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new SupportError("NOT_FOUND", "Ticket not found.");
  const body = sanitizeText(input.message);
  if (!body && !input.files.length) throw new SupportError("BAD_REQUEST", "Write a reply or attach a file.");
  const now = new Date();
  // WhatsApp conversations: the reply goes out on WhatsApp first, so a refusal (window closed) saves nothing.
  const onWhatsApp = !input.internal && ticket.source === "whatsapp";
  let waMessageId: string | null = null;
  if (onWhatsApp) {
    if (input.files.length) throw new SupportError("BAD_REQUEST", "Files can't be sent on WhatsApp from the inbox yet. Send a link, or ask them to email.");
    if (!ticket.phone) throw new SupportError("BAD_REQUEST", "This conversation has no phone number.");
    if (!whatsappWindowOpen(ticket.lastUserMessageAt, now.getTime())) {
      throw new SupportError("BAD_REQUEST", "WhatsApp's 24-hour reply window has closed. Send a template below to restart the chat.");
    }
    const sent = await sendInboxText(ticket.phone, body);
    if (!sent.ok) throw new SupportError("BAD_REQUEST", `WhatsApp didn't take it: ${sent.error}`);
    waMessageId = sent.id;
  }
  const attachments = input.files.length ? await storeFiles(ticket.id, input.files) : [];
  const message = await db.supportMessage.create({
    data: {
      ticketId: ticket.id,
      authorType: input.asPeggy && !input.internal ? "ai" : "agent",
      authorId: agent.id === PEGGY_ID ? null : agent.id,
      authorName: input.asPeggy && !input.internal ? "Peggy" : agent.name,
      body,
      internal: input.internal,
      attachments: attachments as unknown as Prisma.InputJsonValue,
      channel: onWhatsApp ? "whatsapp" : "app",
      externalId: waMessageId,
      deliveryStatus: onWhatsApp ? "sent" : null,
    },
  });
  if (input.macroId) await db.supportMacro.update({ where: { id: input.macroId }, data: { usageCount: { increment: 1 } } }).catch(() => null);

  if (input.internal) {
    const data: Prisma.SupportTicketUpdateInput = { agentReadAt: now };
    if (input.status) Object.assign(data, statusChange(ticket.status, input.status, now));
    await db.supportTicket.update({ where: { id: ticket.id }, data });
    return { messageId: message.id, delivered: "note" as const };
  }

  // A public reply waits on the customer unless the agent chose another status.
  const status = input.status ?? (ticket.status === "open" ? "pending" : (ticket.status as SupportStatus));
  await db.supportTicket.update({
    where: { id: ticket.id },
    data: {
      lastMessageAt: now,
      lastAgentMessageAt: now,
      agentReadAt: now,
      firstRespondedAt: ticket.firstRespondedAt ?? now,
      assigneeId: ticket.assigneeId ?? (agent.id === PEGGY_ID ? null : agent.id),
      ...statusChange(ticket.status, status, now),
    },
  });
  const delivered = onWhatsApp ? ("whatsapp" as const) : await deliverAgentReply(ticket, body || "Sent you a file.", input.asPeggy ? "Peggy" : agent.name).catch(() => "none" as const);
  return { messageId: message.id, delivered };
}

/** A team note from the system (Peggy's held-back drafts and her notes). */
export async function addInternalNote(ticketId: string, body: string) {
  await db.supportMessage.create({ data: { ticketId, authorType: "agent", authorId: null, authorName: "Peggy", body: sanitizeText(body), internal: true } });
}

function statusChange(from: string, to: SupportStatus, now: Date): Prisma.SupportTicketUpdateInput {
  if (from === to) return {};
  return { status: to, solvedAt: to === "solved" || to === "closed" ? now : null };
}

async function systemNote(ticketId: string, body: string, agent: Viewer) {
  await db.supportMessage.create({ data: { ticketId, authorType: "system", authorId: agent.id, authorName: agent.name, body, internal: true } }).catch(() => null);
}

/** Status, priority, topic or assignee. Each change leaves an internal line in the thread. */
export async function updateTicket(agent: Viewer, ticketId: string, patch: { status?: SupportStatus; priority?: SupportPriority; topic?: SupportTopic; assigneeId?: string | null }) {
  await requireReady();
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new SupportError("NOT_FOUND", "Ticket not found.");
  const now = new Date();
  const data: Prisma.SupportTicketUpdateInput = {};
  const notes: string[] = [];
  if (patch.status && patch.status !== ticket.status) {
    Object.assign(data, statusChange(ticket.status, patch.status, now));
    notes.push(`Status: ${patch.status}`);
  }
  if (patch.priority && patch.priority !== ticket.priority) {
    data.priority = patch.priority;
    // The first-response clock follows the new priority until someone has replied.
    if (!ticket.firstRespondedAt) data.firstResponseDueAt = firstResponseDue(ticket.createdAt, patch.priority);
    notes.push(`Priority: ${patch.priority}`);
  }
  if (patch.topic && patch.topic !== ticket.topic) {
    data.topic = patch.topic;
    notes.push(`Topic: ${topicLabel(patch.topic)}`);
  }
  if (patch.assigneeId !== undefined) {
    const assigneeId = patch.assigneeId === "me" ? agent.id : patch.assigneeId;
    if (assigneeId !== ticket.assigneeId) {
      if (assigneeId) {
        const assignee = await db.user.findFirst({ where: { id: assigneeId, role: "admin", OR: [{ adminRole: null }, { adminRole: { not: "disabled" } }] }, select: { name: true } });
        if (!assignee) throw new SupportError("BAD_REQUEST", "Tickets can only be assigned to admins.");
        notes.push(`Assigned to ${assignee.name}`);
      } else {
        notes.push("Unassigned");
      }
      data.assigneeId = assigneeId;
    }
  }
  if (!notes.length) return { changed: false };
  await db.supportTicket.update({ where: { id: ticket.id }, data });
  await systemNote(ticket.id, `${agent.name.split(" ")[0]} changed ${notes.join(" · ")}`, agent);
  return { changed: true };
}

export async function bulkUpdate(agent: Viewer, input: { ids: string[]; status?: SupportStatus; priority?: SupportPriority; assigneeId?: string | null }) {
  let changed = 0;
  for (const id of input.ids) {
    const result = await updateTicket(agent, id, { status: input.status, priority: input.priority, assigneeId: input.assigneeId }).catch(() => ({ changed: false }));
    if (result.changed) changed += 1;
  }
  return { changed };
}

export async function listAdmins() {
  return adminUsers();
}

// ─── Macros ───────────────────────────────────────────────────────────────────

/** Starter canned replies, shown until the team saves their own. */
export const STARTER_MACROS = [
  { id: "starter-login", title: "Can't log in: reset link", topic: "login", status: "pending", body: "Hi {{first_name}},\n\nSorry you're locked out. Go to shopinbos.com/forgot-password and enter the email or phone number on your account. We'll send a code to get you back in. If the code doesn't arrive in 5 minutes, reply here and we'll sort it out with you.\n\n{{agent}}, Shopinbos" },
  { id: "starter-payments", title: "Payout timing", topic: "payments", status: "pending", body: "Hi {{first_name}},\n\nPayouts reach your bank 1-2 working days after an order is marked delivered. You can see each payout and its status under Payouts. If one is older than that, reply with the order number and we'll check it today.\n\n{{agent}}, Shopinbos" },
  { id: "starter-solved", title: "Fixed: anything else?", topic: null, status: "solved", body: "Hi {{first_name}},\n\nThat's sorted now. If anything else comes up, reply to this message and it reopens {{ticket}} straight away.\n\n{{agent}}, Shopinbos" },
] as const;

export async function listMacros() {
  if (!(await supportReady())) return [];
  return db.supportMacro.findMany({ orderBy: [{ usageCount: "desc" }, { title: "asc" }], take: 200 }).catch(() => []);
}

export async function saveMacro(agent: Viewer, id: string | null, input: { title: string; body: string; topic?: string | null; status?: string | null }) {
  await requireReady();
  const data = { title: input.title, body: sanitizeText(input.body), topic: input.topic ?? null, status: input.status ?? null };
  if (id) {
    const found = await db.supportMacro.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new SupportError("NOT_FOUND", "Saved reply not found.");
    return db.supportMacro.update({ where: { id }, data });
  }
  return db.supportMacro.create({ data: { ...data, createdById: agent.id } });
}

export async function deleteMacro(id: string) {
  await requireReady();
  await db.supportMacro.delete({ where: { id } }).catch(() => {
    throw new SupportError("NOT_FOUND", "Saved reply not found.");
  });
}

export function renderMacro(body: string, ticket: { name: string; number: number }, agent: { name: string }) {
  return fillMacro(body, { name: ticket.name, ticket: ticket.number, agent: agent.name });
}

// ─── Inbound email ────────────────────────────────────────────────────────────

/**
 * An email to the support inbox. Replies ("support+sb-1042@…" or "[SB-1042]" in the subject) from the ticket's
 * own customer join that thread; anything else opens a new ticket. Message-IDs are stored so retries are no-ops.
 */
type InboundSupportEmail = { fromEmail: string; fromName: string | null; subject: string; text: string; messageId: string | null; attachments: number; number: number | null; body: string };

export async function ingestSupportEmail(email: InboundSupportEmail) {
  try {
    return await ingestSupportEmailOnce(email);
  } catch (error) {
    // Two deliveries of the same email racing past the check below: the unique externalId stops the second.
    if (email.messageId && isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}

async function ingestSupportEmailOnce(email: InboundSupportEmail) {
  if (!(await supportReady())) return "not-ready";
  if (email.messageId) {
    const seen = await db.supportMessage.findUnique({ where: { externalId: email.messageId }, select: { id: true } });
    if (seen) return "duplicate";
  }
  const from = email.fromEmail.toLowerCase();
  const note = email.attachments ? `\n\n(${email.attachments} attachment${email.attachments === 1 ? "" : "s"} in the original email)` : "";
  const body = sanitizeText(`${email.body || "(empty email)"}${note}`);

  if (email.number) {
    const ticket = await db.supportTicket.findUnique({ where: { number: email.number } });
    if (ticket && ticket.status !== "closed") {
      const account = ticket.userId ? await db.user.findUnique({ where: { id: ticket.userId }, select: { email: true } }) : null;
      const owner = [ticket.email, account?.email].some((address) => address?.toLowerCase() === from);
      if (owner) {
        await recordUserMessage(ticket, { body, files: [], authorId: ticket.userId, authorName: email.fromName ?? ticket.name, channel: "email", externalId: email.messageId });
        queuePeggyAutoReply(ticket.id);
        return "reply";
      }
    }
  }

  const matched = await db.user.findUnique({ where: { email: from }, select: { id: true, role: true, name: true } }).catch(() => null);
  const opened = await openTicket({
    userId: null,
    name: email.fromName || matched?.name || from,
    email: from,
    phone: null,
    portal: "public",
    topic: "other",
    subject: email.subject.replace(/^(re|fwd?):\s*/i, "").slice(0, 160) || undefined,
    message: body,
    source: "email",
    externalId: email.messageId,
    meta: { matchedUserId: matched?.id ?? null, matchedRole: matched?.role ?? null },
  });
  queuePeggyAutoReply(opened.id);
  return "ticket";
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

/**
 * A WhatsApp message to Shopinbos's own number (/api/webhooks/whatsapp). It joins the person's open conversation,
 * or a solved one (which reopens it); otherwise it starts a new one. Photos and files are copied from Meta.
 */
export async function ingestSupportWhatsApp(input: {
  phone: string;
  name: string | null;
  text: string;
  messageId: string | null;
  attachments: Array<{ mediaId: string | null; name: string | null; contentType: string | null }>;
}) {
  if (!(await supportReady())) return "not-ready";
  const phone = whatsappPhone(input.phone);
  if (!phone) return "no-phone";
  if (input.messageId) {
    const seen = await db.supportMessage.findUnique({ where: { externalId: input.messageId }, select: { id: true } });
    if (seen) return "duplicate";
  }
  const files: File[] = [];
  let skipped = 0;
  for (const attachment of input.attachments.slice(0, MAX_ATTACHMENTS)) {
    const file = attachment.mediaId ? await downloadInboxMedia(attachment.mediaId, attachment.name, attachment.contentType).catch(() => null) : null;
    if (file && !attachmentProblem(file)) files.push(file);
    else skipped += 1;
  }
  const note = skipped ? `\n\n(${skipped} file${skipped === 1 ? "" : "s"} couldn't be copied: open WhatsApp to see ${skipped === 1 ? "it" : "them"})` : "";
  const body = sanitizeText(`${input.text || (files.length ? "" : "(empty message)")}${note}`);

  // STOP: no more lead messages on WhatsApp. The conversation itself still comes in, so the team sees it.
  const lead = await db.websiteLead.findFirst({ where: { phone: { endsWith: phone.slice(-10) } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }).catch(() => null);
  if (lead && isStopMessage(input.text)) {
    const { optOutLead } = await import("@/lib/lead-growth/service.server");
    await optOutLead(lead.id, "whatsapp").catch(() => null);
  }

  try {
    const existing = await db.supportTicket.findFirst({ where: { source: "whatsapp", phone, status: { not: "closed" } }, orderBy: { lastMessageAt: "desc" } });
    if (existing) {
      await recordUserMessage(existing, { body, files, authorId: existing.userId, authorName: input.name || existing.name, channel: "whatsapp", externalId: input.messageId });
      queuePeggyAutoReply(existing.id);
      return "reply";
    }
    const matched = await db.user.findFirst({ where: { phone: { endsWith: phone.slice(-10) } }, select: { id: true, role: true, name: true } }).catch(() => null);
    const ticket = await openTicket({
      userId: null,
      name: input.name || matched?.name || lead?.name || phone,
      email: null,
      phone,
      portal: portalOf(matched?.role),
      topic: "other",
      subject: `WhatsApp from ${input.name || matched?.name || phone}`,
      message: body,
      files,
      source: "whatsapp",
      externalId: input.messageId,
      meta: { matchedUserId: matched?.id ?? null, matchedRole: matched?.role ?? null, leadId: lead?.id ?? null },
    });
    queuePeggyAutoReply(ticket.id);
    return "ticket";
  } catch (error) {
    if (input.messageId && isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}

// ─── Starting conversations ───────────────────────────────────────────────────

type StartBase = {
  name: string;
  /** Chosen from the people list: the account (they also see it in their app) or the lead. */
  userId?: string | null;
  leadId?: string | null;
  business?: string | null;
};

export type StartConversation =
  | (StartBase & { channel: "email"; email: string; subject: string; message: string })
  | (StartBase & { channel: "whatsapp"; phone: string; template?: string | null; note?: string; text?: string })
  | (StartBase & { channel: "app"; subject: string; message: string });

/** The account a conversation is about, when the team picked one (never an admin). */
async function chosenAccount(userId: string | null | undefined) {
  if (!userId) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, email: true, phone: true } }).catch(() => null);
  return user && user.role !== "admin" ? user : null;
}

async function notifyInApp(ticket: { number: number; userId: string | null; portal: string }, body: string, agentName: string) {
  if (!ticket.userId) return;
  const link = ticketLinkFor(ticket.portal, ticket.number).replace(appBase(), "");
  await createNotification({
    userId: ticket.userId,
    type: "system",
    priority: "info",
    title: `${agentName.split(" ")[0] || "Shopinbos"} from Shopinbos sent you a message`,
    description: preview(body, 160),
    link,
    actionLabel: "Read it",
    actionUrl: link,
    metadata: { supportTicket: ticket.number },
    event: "support.reply",
  }).catch(() => null);
}

/**
 * The team writes first: an email (replies thread back by the ticket number), an in-app message (their support
 * chat, with a notification), or WhatsApp. WhatsApp only lets a business start a chat with an approved template;
 * inside the 24 hours after their last message the team can write freely. A WhatsApp message to someone with an
 * open conversation goes into that one.
 */
export async function startConversation(agent: Viewer, input: StartConversation) {
  await requireReady();
  const now = new Date();
  const account = await chosenAccount(input.userId);
  const name = (input.name.trim() || account?.name || "").slice(0, 120);
  const meta = (extra: Record<string, unknown>) => ({ matchedUserId: account?.id ?? extra.matchedUserId ?? null, matchedRole: account?.role ?? extra.matchedRole ?? null, leadId: input.leadId ?? null, startedBy: agent.id });

  if (input.channel === "app") {
    if (!account) throw new SupportError("BAD_REQUEST", "Choose someone with a Shopinbos account for an in-app message.");
    const subject = input.subject.trim().slice(0, 160);
    const body = sanitizeText(input.message);
    if (!subject) throw new SupportError("BAD_REQUEST", "Add a subject.");
    if (!body) throw new SupportError("BAD_REQUEST", "Write the message.");
    const ticket = await agentTicket(agent, { userId: account.id, name: name || account.name, email: account.email, phone: account.phone, portal: portalOf(account.role), subject, source: "app", body, channel: "app", externalId: null, meta: meta({}) });
    await notifyInApp(ticket, body, agent.name);
    return { number: ticket.number, delivered: true };
  }

  if (input.channel === "email") {
    const email = input.email.trim().toLowerCase();
    const subject = input.subject.trim().slice(0, 160);
    const body = sanitizeText(input.message);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SupportError("BAD_REQUEST", "Enter a valid email.");
    if (!subject) throw new SupportError("BAD_REQUEST", "Add a subject.");
    if (!body) throw new SupportError("BAD_REQUEST", "Write the message.");
    if (!isEmailConfigured()) throw new SupportError("BAD_REQUEST", "Email isn't set up (RESEND_API_KEY).");
    const matched = account ?? (await db.user.findUnique({ where: { email }, select: { id: true, role: true, name: true } }).catch(() => null));
    const ticket = await agentTicket(agent, {
      // Picked from the list: it's in their app too. Typed by hand: only matched for the side panel.
      userId: account?.id ?? null,
      name: name || matched?.name || email,
      email,
      phone: account?.phone ?? null,
      portal: portalOf(matched?.role),
      subject,
      source: "email",
      body,
      channel: "email",
      externalId: null,
      meta: meta({ matchedUserId: matched?.id ?? null, matchedRole: matched?.role ?? null }),
    });
    const sent = await sendEmail({
      to: [email],
      subject: `[${formatTicketNumber(ticket.number)}] ${subject}`,
      html: newConversationEmail({ name: ticket.name, number: ticket.number, subject, body, agentName: agent.name }),
      replyTo: replyAddressFor(ticket.number),
    }).catch(() => ({ success: false }));
    if (!sent.success) await systemNote(ticket.id, "The email didn't send. Check the address and reply again.", agent);
    await notifyInApp(ticket, body, agent.name);
    return { number: ticket.number, delivered: sent.success };
  }

  const phone = whatsappPhone(input.phone);
  if (!phone) throw new SupportError("BAD_REQUEST", "Enter a WhatsApp number with its country code, like +234 803 412 7790.");
  const matched = account ?? (await db.user.findFirst({ where: { phone: { endsWith: phone.slice(-10) } }, select: { id: true, role: true, name: true } }).catch(() => null));
  const open = await db.supportTicket.findFirst({ where: { source: "whatsapp", phone, status: { not: "closed" } }, orderBy: { lastMessageAt: "desc" } });
  const values = { name: name || open?.name || matched?.name || null, agent: agent.name, note: input.note ?? null, business: input.business ?? null };

  let body: string;
  let sentId: string | null;
  const freeText = sanitizeText(input.text ?? "");
  if (!input.template && freeText) {
    // A direct message: only inside WhatsApp's 24-hour window.
    if (!open || !whatsappWindowOpen(open.lastUserMessageAt, now.getTime())) throw new SupportError("BAD_REQUEST", "They haven't messaged in the last 24 hours, so WhatsApp needs a template to start. Pick one.");
    const sent = await sendInboxText(phone, freeText);
    if (!sent.ok) throw new SupportError("BAD_REQUEST", `WhatsApp didn't take it: ${sent.error}`);
    body = freeText;
    sentId = sent.id;
  } else {
    const template = await findTeamTemplate(input.template);
    if (!template) throw new SupportError("BAD_REQUEST", "Pick a message template.");
    const problem = teamTemplateProblem(template, values);
    if (problem) throw new SupportError("BAD_REQUEST", problem);
    const sent = await sendInboxTemplate(phone, template, values);
    if (!sent.ok) throw new SupportError("BAD_REQUEST", `WhatsApp didn't take it: ${sent.error}`);
    body = renderTeamTemplate(template, values);
    sentId = sent.id;
  }

  if (open) {
    await db.supportMessage.create({ data: { ticketId: open.id, authorType: "agent", authorId: agent.id, authorName: agent.name, body, channel: "whatsapp", externalId: sentId, deliveryStatus: "sent" } });
    await db.supportTicket.update({
      where: { id: open.id },
      data: { lastMessageAt: now, lastAgentMessageAt: now, agentReadAt: now, firstRespondedAt: open.firstRespondedAt ?? now, assigneeId: open.assigneeId ?? agent.id, ...statusChange(open.status, "pending", now) },
    });
    return { number: open.number, delivered: true };
  }
  const ticket = await agentTicket(agent, {
    userId: null,
    name: values.name || phone,
    email: account?.email ?? null,
    phone,
    portal: portalOf(matched?.role),
    subject: `WhatsApp with ${values.name || phone}`,
    source: "whatsapp",
    body,
    channel: "whatsapp",
    externalId: sentId,
    meta: meta({ matchedUserId: matched?.id ?? null, matchedRole: matched?.role ?? null }),
  });
  return { number: ticket.number, delivered: true };
}

/** Is there an open WhatsApp conversation with this number whose 24-hour window is open (direct messages allowed)? */
export async function whatsappWindowFor(rawPhone: string) {
  const phone = whatsappPhone(rawPhone);
  if (!phone) return { open: false, number: null as number | null };
  const ticket = await db.supportTicket.findFirst({ where: { source: "whatsapp", phone, status: { not: "closed" } }, orderBy: { lastMessageAt: "desc" }, select: { number: true, lastUserMessageAt: true } }).catch(() => null);
  return { open: Boolean(ticket && whatsappWindowOpen(ticket.lastUserMessageAt)), number: ticket?.number ?? null };
}

/** A conversation the team opened: waiting on the customer, assigned to whoever wrote first. */
async function agentTicket(
  agent: Viewer,
  input: { userId: string | null; name: string; email: string | null; phone: string | null; portal: SupportPortal; subject: string; source: "email" | "whatsapp" | "app"; body: string; channel: string; externalId: string | null; meta: Record<string, unknown> },
) {
  const now = new Date();
  const ticket = await db.supportTicket.create({
    data: {
      userId: input.userId,
      name: input.name.slice(0, 120) || "Someone",
      email: input.email,
      phone: input.phone,
      portal: input.portal,
      topic: "other",
      subject: input.subject.slice(0, 160),
      status: "pending",
      priority: "normal",
      source: input.source,
      assigneeId: agent.id,
      firstRespondedAt: now,
      lastMessageAt: now,
      lastAgentMessageAt: now,
      agentReadAt: now,
      meta: input.meta as Prisma.InputJsonValue,
    },
  });
  await db.supportMessage.create({
    data: { ticketId: ticket.id, authorType: "agent", authorId: agent.id, authorName: agent.name, body: input.body, channel: input.channel, externalId: input.externalId, deliveryStatus: input.channel === "whatsapp" ? "sent" : null },
  });
  return ticket;
}

// ─── Website leads ────────────────────────────────────────────────────────────

/**
 * A website form with a question (contact form, "talk to us") becomes an inbox conversation, so the team (or
 * Peggy) answers it like any other. Replies go by email, or WhatsApp from the conversation. One per lead.
 */
export async function conversationFromLead(leadId: string): Promise<number | null> {
  if (!(await supportReady())) return null;
  const lead = await db.websiteLead.findUnique({ where: { id: leadId } });
  if (!lead?.message?.trim()) return null;
  const existing = await db.supportTicket.findFirst({ where: { meta: { path: ["leadId"], equals: lead.id } }, select: { number: true } });
  if (existing) return existing.number;
  const email = lead.email?.trim().toLowerCase() || null;
  const phone = whatsappPhone(lead.phone);
  const matched = email
    ? await db.user.findUnique({ where: { email }, select: { id: true, role: true } }).catch(() => null)
    : phone
      ? await db.user.findFirst({ where: { phone: { endsWith: phone.slice(-10) } }, select: { id: true, role: true } }).catch(() => null)
      : null;
  try {
    const ticket = await openTicket({
      userId: null,
      name: lead.name?.trim() || email || phone || "Website visitor",
      email,
      phone,
      portal: "public",
      topic: "other",
      message: lead.message,
      source: "web",
      path: lead.pageUrl ?? undefined,
      externalId: `lead:${lead.id}`,
      meta: { leadId: lead.id, leadKind: lead.kind, leadRole: lead.role, matchedUserId: matched?.id ?? null, matchedRole: matched?.role ?? null },
    });
    queuePeggyAutoReply(ticket.id);
    return ticket.number;
  } catch (error) {
    // Two runs for the same lead: the unique externalId stops the second.
    if (isUniqueViolation(error)) {
      const again = await db.supportTicket.findFirst({ where: { meta: { path: ["leadId"], equals: lead.id } }, select: { number: true } });
      return again?.number ?? null;
    }
    throw error;
  }
}

/**
 * What WhatsApp reports about a message the team sent (/api/webhooks/whatsapp): sent → delivered → read, or
 * failed with Meta's reason. Never goes backwards (a late "delivered" after "read" is ignored).
 */
export async function updateSupportDelivery(externalId: string, status: string, error?: string | null) {
  if (!externalId || !["sent", "delivered", "read", "failed"].includes(status)) return;
  const message = await db.supportMessage.findUnique({ where: { externalId }, select: { id: true, deliveryStatus: true } }).catch(() => null);
  if (!message) return;
  const rank = { sent: 1, delivered: 2, read: 3, failed: 4 } as Record<string, number>;
  if ((rank[message.deliveryStatus ?? ""] ?? 0) >= rank[status]! && status !== "failed") return;
  await db.supportMessage.update({ where: { id: message.id }, data: { deliveryStatus: status, deliveryError: status === "failed" ? (error || "WhatsApp couldn't deliver it.").slice(0, 300) : null } });
}
