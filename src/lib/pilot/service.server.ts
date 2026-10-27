import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appBase, platformLegal } from "@/lib/email/compliance.server";
import { html, platformEmail } from "@/lib/email/shell";
import { sendEmail } from "@/lib/notifications/resend";
import { isMissingTable } from "@/lib/rate-limit-core";
import { firstName, leadAddress, leadRoleFrom, type LeadChannel } from "@/lib/lead-growth/pure";
import { sendToLead, type SendOutcome } from "@/lib/lead-growth/send.server";
import { formatWhatsApp, whatsappChatUrl } from "@/lib/support-contact";
import { signupPath } from "@shared/referrals";
import {
  autoPick,
  canDecide,
  inviteMessage,
  pilotIsClosed,
  readTargets,
  reminderMessage,
  selectedMessage,
  waitlistedMessage,
  type PilotProgramInputType,
  type PilotReplyType,
  type PilotRole,
  type TextChannel,
} from "./pure";
import { pilotReplyUrl } from "./tokens";

// Pilot testing: invite waitlist leads (email, or SMS / WhatsApp when there's no email), take replies on a personal
// link until the deadline, send one reminder, pick the testers, then tell each person the outcome by email.
// docs/migrations/2026-12-01-pilot-testing.sql

export class PilotNotReady extends Error {}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (isMissingTable(error) || code === "P2021" || code === "P2022") throw new PilotNotReady("Run docs/migrations/2026-12-01-pilot-testing.sql on the Supabase database first.");
    throw error;
  }
}

/** Runs `work` over `items`, a few at a time, stopping at the deadline. */
async function eachLimited<T>(items: T[], deadline: number, work: (item: T) => Promise<void>, concurrency = 5) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ─── Programs ───────────────────────────────────────────────────────────────────────────────────────────────────

function programData(input: PilotProgramInputType) {
  return {
    name: input.name,
    closesAt: input.closesAt,
    roles: input.roles,
    targets: input.targets as unknown as Prisma.InputJsonValue,
    includeNoConsent: input.includeNoConsent,
    textChannel: input.textChannel,
  };
}

export function createProgram(input: PilotProgramInputType, createdById: string) {
  return guard(() => db.pilotProgram.create({ data: { ...programData(input), createdById }, select: { id: true } }));
}

export function updateProgram(id: string, input: PilotProgramInputType) {
  // A later deadline re-opens replies on a pilot that closed by passing it (one closed by hand stays closed).
  return guard(() => db.pilotProgram.update({ where: { id }, data: programData(input), select: { id: true } }));
}

export function deleteProgram(id: string) {
  return guard(() => db.pilotProgram.deleteMany({ where: { id, invitedAt: null } }));
}

/** Close replies now (before the deadline), or open them again (only while the deadline is still ahead). */
export function setProgramClosed(id: string, closed: boolean) {
  return guard(() => db.pilotProgram.updateMany({ where: { id, ...(closed ? {} : { closesAt: { gt: new Date() } }) }, data: { status: closed ? "closed" : "open" } }));
}

export type StatusCounts = Record<string, Record<string, number>>;

async function countsFor(programIds: string[]) {
  const rows = programIds.length ? await db.pilotApplicant.groupBy({ by: ["programId", "role", "status"], where: { programId: { in: programIds } }, _count: { _all: true } }) : [];
  const byProgram = new Map<string, StatusCounts>();
  for (const row of rows) {
    const counts = byProgram.get(row.programId) ?? {};
    counts[row.role] = { ...counts[row.role], [row.status]: row._count._all };
    byProgram.set(row.programId, counts);
  }
  return byProgram;
}

export function listPrograms() {
  return guard(async () => {
    const programs = await db.pilotProgram.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    const counts = await countsFor(programs.map((p) => p.id));
    return programs.map((program) => ({ ...program, targets: readTargets(program.targets), counts: counts.get(program.id) ?? {} }));
  });
}

export function getProgram(id: string) {
  return guard(async () => {
    const program = await db.pilotProgram.findUnique({ where: { id } });
    if (!program) return null;
    const applicants = await db.pilotApplicant.findMany({
      where: { programId: id },
      orderBy: [{ appliedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      include: { lead: { select: { consent: true, convertedUserId: true, createdAt: true, source: true } } },
    });
    const counts = (await countsFor([id])).get(id) ?? {};
    return { ...program, targets: readTargets(program.targets), applicants, counts };
  });
}

// ─── Invitations ────────────────────────────────────────────────────────────────────────────────────────────────

/** Leads the pilot invites: the chosen roles, reachable, not closed by the team, and (unless allowed) who agreed to messages. */
function inviteWhere(program: { roles: string[]; includeNoConsent: boolean; textChannel: string }): Prisma.WebsiteLeadWhereInput {
  const reachable: Prisma.WebsiteLeadWhereInput[] = [{ email: { not: null }, NOT: { optedOut: { has: "email" } } }];
  if (program.textChannel !== "none") reachable.push({ phone: { not: null }, NOT: { optedOut: { has: program.textChannel } } });
  return {
    role: { in: program.roles },
    status: { not: "closed" },
    ...(program.includeNoConsent ? {} : { consent: true }),
    OR: reachable,
  };
}

/** How many leads per role an invite would reach right now (for the setup form). */
export function previewInvites(program: { roles: string[]; includeNoConsent: boolean; textChannel: string }) {
  return guard(async () => {
    const rows = await db.websiteLead.groupBy({ by: ["role"], where: inviteWhere(program), _count: { _all: true } });
    return Object.fromEntries(rows.map((row) => [row.role, row._count._all])) as Partial<Record<PilotRole, number>>;
  });
}

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; optedOut: string[] };

/** Email when we have one; otherwise the pilot's text channel. */
function channelFor(lead: Contact, textChannel: string): LeadChannel | null {
  if (leadAddress(lead, "email")) return "email";
  if (textChannel !== "none" && leadAddress(lead, textChannel as LeadChannel)) return textChannel as LeadChannel;
  return null;
}

async function sendPilotMessage(lead: Contact, channel: LeadChannel, message: { subject: string | null; body: string; ctaLabel?: string }, link: string, context: string): Promise<SendOutcome> {
  return sendToLead(
    { ...lead, kind: "pilot" },
    { channel, subject: message.subject, body: message.body, ctaLabel: message.ctaLabel ?? null, ctaUrl: channel === "email" ? link : null, waTemplate: null, waLanguage: null, imageUrl: null },
    { name: context },
  );
}

/**
 * Adds every matching lead to the pilot (once) and sends the invitations not sent yet, until the deadline passes;
 * running it again carries on, and later leads who match are added and invited too. Each invite is claimed
 * (invitedAt set) before it goes, so a double click never sends twice.
 */
export async function sendInvites(programId: string, deadline: number) {
  return guard(async () => {
    const program = await db.pilotProgram.findUnique({ where: { id: programId } });
    if (!program) throw new Error("Pilot not found.");
    if (pilotIsClosed(program)) throw new Error("Replies for this pilot are closed. Move the deadline to invite more people.");
    const leads = await db.websiteLead.findMany({ where: { ...inviteWhere(program), pilots: { none: { programId } } }, select: { id: true, name: true, email: true, phone: true, role: true }, take: 5000 });
    if (leads.length) {
      await db.pilotApplicant.createMany({
        data: leads.map((lead) => ({ programId, leadId: lead.id, role: leadRoleFrom(lead.role), name: lead.name, email: lead.email, phone: lead.phone })),
        skipDuplicates: true,
      });
    }
    await db.pilotProgram.update({ where: { id: programId }, data: { status: "open", invitedAt: program.invitedAt ?? new Date() } });

    const pending = await db.pilotApplicant.findMany({ where: { programId, invitedAt: null, status: "invited" }, include: { lead: { select: { id: true, name: true, email: true, phone: true, optedOut: true } } } });
    const result = { added: leads.length, sent: 0, failed: 0, remaining: 0 };
    await eachLimited(pending, deadline, async (applicant) => {
      const claimed = await db.pilotApplicant.updateMany({ where: { id: applicant.id, invitedAt: null }, data: { invitedAt: new Date() } });
      if (!claimed.count) return;
      const lead = applicant.lead;
      const channel = lead ? channelFor(lead, program.textChannel) : null;
      if (!lead || !channel) {
        result.failed += 1;
        await db.pilotApplicant.update({ where: { id: applicant.id }, data: { inviteError: "No email or phone we can use" } });
        return;
      }
      const link = pilotReplyUrl(appBase(), applicant.id);
      const message = inviteMessage({ role: applicant.role as PilotRole, firstName: firstName(lead.name), closesAt: program.closesAt, link, channel });
      const outcome = await sendPilotMessage(lead, channel, message, link, `pilot-${program.name}`);
      if (outcome.status === "sent") result.sent += 1;
      else result.failed += 1;
      await db.pilotApplicant.update({ where: { id: applicant.id }, data: { inviteChannel: channel, inviteError: outcome.status === "sent" ? null : outcome.error.slice(0, 300) } });
    });
    result.remaining = await db.pilotApplicant.count({ where: { programId, invitedAt: null, status: "invited" } });
    return result;
  });
}

/** One reminder to everyone invited who hasn't replied (and whose invite went out). Never sent twice to a person. */
export async function sendReminders(programId: string, deadline: number) {
  return guard(async () => {
    const program = await db.pilotProgram.findUnique({ where: { id: programId } });
    if (!program) throw new Error("Pilot not found.");
    if (pilotIsClosed(program)) throw new Error("Replies for this pilot are closed, so there's nothing to remind people about.");
    const pending = await db.pilotApplicant.findMany({
      where: { programId, status: "invited", invitedAt: { not: null }, inviteError: null, remindedAt: null },
      include: { lead: { select: { id: true, name: true, email: true, phone: true, optedOut: true } } },
    });
    const result = { sent: 0, failed: 0, remaining: 0 };
    await eachLimited(pending, deadline, async (applicant) => {
      const claimed = await db.pilotApplicant.updateMany({ where: { id: applicant.id, remindedAt: null, status: "invited" }, data: { remindedAt: new Date() } });
      if (!claimed.count || !applicant.lead) return;
      const channel = channelFor(applicant.lead, program.textChannel);
      if (!channel) return;
      const link = pilotReplyUrl(appBase(), applicant.id);
      const outcome = await sendPilotMessage(applicant.lead, channel, reminderMessage({ firstName: firstName(applicant.lead.name), closesAt: program.closesAt, link, channel }), link, `pilot-${program.name}`);
      if (outcome.status === "sent") result.sent += 1;
      else result.failed += 1;
    });
    await db.pilotProgram.update({ where: { id: programId }, data: { remindedAt: new Date() } });
    result.remaining = await db.pilotApplicant.count({ where: { programId, status: "invited", invitedAt: { not: null }, inviteError: null, remindedAt: null } });
    return result;
  });
}

// ─── Replies (/pilot/<token>) ───────────────────────────────────────────────────────────────────────────────────

export function applicantForReply(applicantId: string) {
  return guard(() =>
    db.pilotApplicant.findUnique({
      where: { id: applicantId },
      include: { program: { select: { name: true, status: true, closesAt: true } } },
    }),
  );
}

export type ReplyOutcome = "saved" | "closed" | "decided" | "missing";

/** Saves (or updates, until the deadline) a reply. The email they give is also kept on the lead when it had none. */
export function saveReply(applicantId: string, reply: PilotReplyType): Promise<ReplyOutcome> {
  return guard(async () => {
    const applicant = await applicantForReply(applicantId);
    if (!applicant) return "missing";
    if (pilotIsClosed(applicant.program)) return "closed";
    if (!["invited", "applied", "declined"].includes(applicant.status)) return "decided";
    await db.pilotApplicant.update({
      where: { id: applicantId },
      data: { ...reply, status: "applied", appliedAt: applicant.appliedAt ?? new Date() },
    });
    if (applicant.leadId) {
      await db.websiteLead.updateMany({ where: { id: applicant.leadId, email: null }, data: { email: reply.email } });
      if (reply.phone) await db.websiteLead.updateMany({ where: { id: applicant.leadId, phone: null }, data: { phone: reply.phone } });
    }
    return "saved";
  });
}

export function declineReply(applicantId: string): Promise<ReplyOutcome> {
  return guard(async () => {
    const applicant = await applicantForReply(applicantId);
    if (!applicant) return "missing";
    if (pilotIsClosed(applicant.program)) return "closed";
    if (!["invited", "applied", "declined"].includes(applicant.status)) return "decided";
    await db.pilotApplicant.update({ where: { id: applicantId }, data: { status: "declined" } });
    return "saved";
  });
}

// ─── Picking testers ────────────────────────────────────────────────────────────────────────────────────────────

/** Select, move to the next wave, or undo (back to "replied"), until the person has been told. */
export function decide(applicantId: string, status: "selected" | "waitlisted" | "applied", adminNote?: string) {
  return guard(async () => {
    const applicant = await db.pilotApplicant.findUnique({ where: { id: applicantId }, select: { status: true, notifiedAt: true, programId: true } });
    if (!applicant || applicant.notifiedAt || !canDecide(applicant.status)) return null;
    await db.pilotApplicant.update({ where: { id: applicantId }, data: { status, decidedAt: status === "applied" ? null : new Date(), ...(adminNote !== undefined ? { adminNote: adminNote || null } : {}) } });
    return applicant.programId;
  });
}

/** Fills each role's open places with the earliest replies. */
export function autoPickProgram(programId: string) {
  return guard(async () => {
    const program = await db.pilotProgram.findUnique({ where: { id: programId }, select: { targets: true } });
    if (!program) return 0;
    const applicants = await db.pilotApplicant.findMany({ where: { programId, notifiedAt: null }, select: { id: true, role: true, status: true, appliedAt: true } });
    const ids = autoPick(applicants, readTargets(program.targets));
    if (ids.length) await db.pilotApplicant.updateMany({ where: { id: { in: ids }, status: "applied" }, data: { status: "selected", decidedAt: new Date() } });
    return ids.length;
  });
}

/** Everyone who replied and wasn't picked goes to the next wave (so they hear back too). */
export function waitlistTheRest(programId: string) {
  return guard(async () => (await db.pilotApplicant.updateMany({ where: { programId, status: "applied", notifiedAt: null }, data: { status: "waitlisted", decidedAt: new Date() } })).count);
}

function decisionEmail(applicant: { role: string; status: string; name: string | null }, hasAccount: boolean) {
  const app = appBase();
  const first = firstName(applicant.name);
  const legal = platformLegal();
  const chat = whatsappChatUrl("Hi Shopinbos, I'm in the pilot and have feedback");
  if (applicant.status === "selected") {
    const role = applicant.role as PilotRole;
    const message = selectedMessage({ role, firstName: first, hasAccount });
    const start = hasAccount ? `${app}${role === "supplier" ? "/supplier/login" : role === "delivery" ? "/logistics/login" : "/login"}` : `${app}${signupPath(role === "delivery" ? "logistics_partner" : role)}`;
    const body = `${html.p(message.intro)}${html.list(message.checklist)}${html.p(message.after)}${html.raw(`Feedback and help: <a href="${chat}" class="sib-link">WhatsApp ${formatWhatsApp()}</a>`)}`;
    return {
      subject: message.subject,
      html: platformEmail({ appUrl: app, kind: "transactional", heading: message.subject, preheader: message.intro.slice(0, 120), bodyHtml: body, cta: { label: message.ctaLabel, url: start }, reason: "you applied to test Shopinbos", legal }),
    };
  }
  const message = waitlistedMessage({ firstName: first });
  return {
    subject: message.subject,
    html: platformEmail({ appUrl: app, kind: "transactional", heading: message.subject, preheader: message.body.split("\n")[0], bodyHtml: html.text(message.body), cta: null, reason: "you applied to test Shopinbos", legal }),
  };
}

/** Emails everyone selected ("you're in" + checklist) or moved to the next wave, once each. Only after replies close. */
export async function notifyDecisions(programId: string, deadline: number) {
  return guard(async () => {
    const program = await db.pilotProgram.findUnique({ where: { id: programId } });
    if (!program) throw new Error("Pilot not found.");
    if (!pilotIsClosed(program)) throw new Error("Close replies first, so nobody hears back while others can still reply.");
    const pending = await db.pilotApplicant.findMany({ where: { programId, status: { in: ["selected", "waitlisted"] }, notifiedAt: null, email: { not: null } }, include: { lead: { select: { convertedUserId: true } } } });
    const emails = pending.map((a) => a.email!.toLowerCase());
    const users = emails.length ? await db.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { email: true } }) : [];
    const withAccount = new Set(users.map((u) => (u.email ?? "").toLowerCase()));
    const result = { selected: 0, waitlisted: 0, failed: 0, remaining: 0 };
    await eachLimited(pending, deadline, async (applicant) => {
      const claimed = await db.pilotApplicant.updateMany({ where: { id: applicant.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
      if (!claimed.count) return;
      const email = decisionEmail(applicant, Boolean(applicant.lead?.convertedUserId) || withAccount.has(applicant.email!.toLowerCase()));
      const sent = await sendEmail({ to: [applicant.email!], subject: email.subject, html: email.html }).catch((error) => ({ success: false, message: String(error) }));
      if (sent.success) {
        if (applicant.status === "selected") result.selected += 1;
        else result.waitlisted += 1;
      } else {
        result.failed += 1;
        // Let it go again on the next click.
        await db.pilotApplicant.update({ where: { id: applicant.id }, data: { notifiedAt: null } });
      }
    });
    result.remaining = await db.pilotApplicant.count({ where: { programId, status: { in: ["selected", "waitlisted"] }, notifiedAt: null, email: { not: null } } });
    return result;
  });
}
