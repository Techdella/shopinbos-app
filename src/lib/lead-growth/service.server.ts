import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { batchOutcome } from "@/lib/email/batch-outcome";
import { isEmailConfigured, sendEmailBatch } from "@/lib/notifications/resend";
import { platformWhatsAppReady } from "@/lib/notifications/service";
import { platformSmsReady } from "@/lib/sms";
import { isMissingTable } from "@/lib/rate-limit-core";
import { normalisePhone } from "@/lib/website-leads/pure";
import { trackServerEvent } from "@/lib/platform-analytics/track.server";
import {
  LEAD_CHANNELS,
  leadAddress,
  readAudience,
  readSteps,
  stepDueAt,
  stepIsStale,
  type LeadAudienceType,
  type LeadChannel,
  type LeadForMessage,
  type LeadMessageContentType,
  type LeadStepType,
} from "./pure";
import { leadEmail, sendToLead, type SendOutcome } from "./send.server";

// Lead growth: one-off campaigns and step-by-step automations that turn website leads into Shopinbos accounts.
// Runs from Admin › Lead campaigns ("Send now") and /api/cron/lead-growth (scheduled campaigns, automation steps,
// sign-up matching). docs/migrations/2026-11-05-lead-growth.sql

export class LeadGrowthNotReady extends Error {}

export async function guardGrowth<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isMissingTable(error) || isMissingColumn(error)) throw new LeadGrowthNotReady("Run docs/migrations/2026-11-05-lead-growth.sql first.");
    throw error;
  }
}

function isMissingColumn(error: unknown) {
  const record = error as { code?: string; message?: string } | null;
  return record?.code === "P2022" || record?.code === "P2021" || /column .* does not exist/i.test(String(record?.message ?? ""));
}

export function channelReadiness(): Record<LeadChannel, boolean> {
  return { email: isEmailConfigured(), sms: platformSmsReady(), whatsapp: platformWhatsAppReady() };
}

const LEAD_SELECT = { id: true, name: true, email: true, phone: true, kind: true, optedOut: true } as const;

// ─── Audience ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Leads an audience covers. With a channel, only those reachable on it (an address, not opted out). */
export function audienceWhere(audience: LeadAudienceType, channel?: LeadChannel): Prisma.WebsiteLeadWhereInput {
  const statuses = audience.statuses.length ? audience.statuses : ["new", "contacted"];
  return {
    status: { in: statuses },
    convertedAt: null,
    ...(audience.roles.length ? { role: { in: audience.roles } } : {}),
    ...(audience.kinds.length ? { kind: { in: audience.kinds } } : {}),
    ...(audience.consentOnly ? { consent: true } : {}),
    ...(audience.sinceDays ? { createdAt: { gte: new Date(Date.now() - audience.sinceDays * 86_400_000) } } : {}),
    ...(audience.source ? { source: { contains: audience.source, mode: "insensitive" as const } } : {}),
    ...(channel
      ? {
          NOT: { optedOut: { has: channel } },
          ...(channel === "email" ? { email: { not: null } } : { phone: { not: null } }),
        }
      : {}),
  };
}

export function countAudience(audience: LeadAudienceType) {
  return guardGrowth(async () => {
    const [all, ...byChannel] = await Promise.all([
      db.websiteLead.count({ where: audienceWhere(audience) }),
      ...LEAD_CHANNELS.map((channel) => db.websiteLead.count({ where: audienceWhere(audience, channel) })),
    ]);
    return { all, email: byChannel[0], sms: byChannel[1], whatsapp: byChannel[2] };
  });
}

// ─── Campaigns ──────────────────────────────────────────────────────────────────────────────────────────────────

export type CampaignInput = LeadMessageContentType & { name: string; audience: LeadAudienceType };

function campaignData(input: CampaignInput) {
  return {
    name: input.name,
    channel: input.channel,
    audience: input.audience as unknown as Prisma.InputJsonValue,
    subject: input.channel === "email" ? input.subject : null,
    body: input.body,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    waTemplate: input.channel === "whatsapp" ? input.waTemplate : null,
    waLanguage: input.channel === "whatsapp" ? input.waLanguage : null,
  };
}

export function createCampaign(input: CampaignInput, createdById: string) {
  return guardGrowth(() => db.leadCampaign.create({ data: { ...campaignData(input), createdById }, select: { id: true } }));
}

/** Only drafts (and scheduled ones, which go back to draft) can be edited. */
export function updateCampaign(id: string, input: CampaignInput) {
  return guardGrowth(() => db.leadCampaign.updateMany({ where: { id, status: { in: ["draft", "scheduled"] } }, data: { ...campaignData(input), status: "draft", scheduledAt: null } }));
}

export function deleteCampaign(id: string) {
  return guardGrowth(() => db.leadCampaign.deleteMany({ where: { id, status: { in: ["draft", "cancelled"] } } }));
}

/** Schedules a draft for `at`, or for right now (the caller then runs it). */
export function scheduleCampaign(id: string, at: Date) {
  return guardGrowth(() => db.leadCampaign.updateMany({ where: { id, status: { in: ["draft", "scheduled"] } }, data: { status: "scheduled", scheduledAt: at } }));
}

/** Stops a scheduled or sending campaign; messages already sent stay sent. */
export function cancelCampaign(id: string) {
  return guardGrowth(() => db.leadCampaign.updateMany({ where: { id, status: { in: ["scheduled", "sending"] } }, data: { status: "cancelled", finishedAt: new Date() } }));
}

export function getCampaign(id: string) {
  return guardGrowth(() => db.leadCampaign.findUnique({ where: { id } }));
}

/** Campaigns, newest first, with how many of the people they reached have since signed up. */
export function listCampaigns() {
  return guardGrowth(async () => {
    const campaigns = await db.leadCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const ids = campaigns.map((c) => c.id);
    const converted = ids.length
      ? await db.$queryRaw<Array<{ campaignId: string; count: number }>>`
          SELECT m."campaignId", count(*)::int AS count
          FROM "LeadMessage" m JOIN "WebsiteLead" l ON l."id" = m."leadId"
          WHERE m."campaignId" IN (${Prisma.join(ids)}) AND m."status" = 'sent' AND l."convertedAt" > m."sentAt"
          GROUP BY m."campaignId"`
      : [];
    const byId = new Map(converted.map((row) => [row.campaignId, row.count]));
    return campaigns.map((c) => ({ ...c, converted: byId.get(c.id) ?? 0 }));
  });
}

function asContent(row: { channel: string; subject: string | null; body: string; ctaLabel: string | null; ctaUrl: string | null; waTemplate: string | null; waLanguage: string | null }): LeadMessageContentType {
  return { channel: row.channel as LeadChannel, subject: row.subject, body: row.body, ctaLabel: row.ctaLabel, ctaUrl: row.ctaUrl, waTemplate: row.waTemplate, waLanguage: row.waLanguage };
}

const BATCH = 50;

async function finishMessage(id: string, leadId: string, outcome: SendOutcome) {
  await db.leadMessage.update({
    where: { id },
    data: { status: outcome.status, to: outcome.to, error: outcome.status === "sent" ? null : outcome.error.slice(0, 500), providerId: outcome.status === "sent" ? outcome.providerId ?? null : null, sentAt: outcome.status === "sent" ? new Date() : null },
  });
  if (outcome.status === "sent") {
    // A first message moves a new lead to "contacted".
    await db.websiteLead.updateMany({ where: { id: leadId }, data: { lastMessagedAt: new Date() } });
    await db.websiteLead.updateMany({ where: { id: leadId, status: "new" }, data: { status: "contacted" } });
  }
}

/**
 * Sends a campaign that is due (scheduled for now or earlier) or already sending, until everyone is reached or the
 * deadline passes (the next run carries on). Each lead is claimed with a LeadMessage row before anything is sent.
 */
export async function runCampaign(id: string, deadline: number) {
  return guardGrowth(async () => {
    const now = new Date();
    const claimed = await db.leadCampaign.updateMany({ where: { id, status: "scheduled", scheduledAt: { lte: now } }, data: { status: "sending", startedAt: now } });
    const campaign = await db.leadCampaign.findUnique({ where: { id } });
    if (!campaign || campaign.status !== "sending") return { sent: 0, failed: 0, done: campaign?.status === "sent" };
    const audience = readAudience(campaign.audience);
    const channel = campaign.channel as LeadChannel;
    const where = audienceWhere(audience, channel);
    if (claimed.count) await db.leadCampaign.update({ where: { id }, data: { total: await db.websiteLead.count({ where }) } });
    const content = asContent(campaign);
    const context = { name: campaign.name };
    let sent = 0;
    let failed = 0;

    while (Date.now() < deadline) {
      const still = await db.leadCampaign.findUnique({ where: { id }, select: { status: true } });
      if (still?.status !== "sending") break;
      const leads = await db.websiteLead.findMany({ where: { ...where, messages: { none: { campaignId: id } } }, select: LEAD_SELECT, orderBy: { createdAt: "asc" }, take: BATCH });
      if (!leads.length) {
        await db.leadCampaign.updateMany({ where: { id, status: "sending" }, data: { status: "sent", finishedAt: new Date() } });
        return { sent, failed, done: true };
      }
      // Claim: rows this run inserted (its own ids) are the ones it sends. Another run's rows are skipped.
      const rows = leads.map((lead) => ({ id: randomUUID(), leadId: lead.id, campaignId: id, channel, to: leadAddress(lead, channel) ?? "", status: "sending" }));
      await db.leadMessage.createMany({ data: rows, skipDuplicates: true });
      const mine = new Set((await db.leadMessage.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
      const work = rows.flatMap((row) => (mine.has(row.id) ? [{ row, lead: leads.find((l) => l.id === row.leadId)! }] : []));

      const outcomes = channel === "email" ? await sendEmails(work.map((w) => w.lead), content, context) : await sendOneByOne(work.map((w) => w.lead), content, context, deadline);
      for (const [index, item] of work.entries()) {
        const outcome = outcomes[index] ?? { status: "failed" as const, to: item.row.to, error: "Not sent before the run ended" };
        await finishMessage(item.row.id, item.lead.id, outcome);
        if (outcome.status === "sent") sent += 1;
        else if (outcome.status === "failed") failed += 1;
      }
      await db.leadCampaign.update({ where: { id }, data: { sent: { increment: outcomes.filter((o) => o.status === "sent").length }, failed: { increment: outcomes.filter((o) => o.status === "failed").length } } });
    }
    return { sent, failed, done: false };
  });
}

async function sendOneByOne(leads: LeadForMessage[], content: LeadMessageContentType, context: { name: string }, deadline: number) {
  const outcomes: SendOutcome[] = [];
  for (const lead of leads) {
    // Stop handing out messages close to the deadline; the claimed rest are marked failed and can be retried.
    if (Date.now() > deadline + 30_000) break;
    outcomes.push(await sendToLead(lead, content, context));
  }
  return outcomes;
}

/** Emails go to Resend in batches (one call per 50), which stays inside its request rate limit. */
async function sendEmails(leads: LeadForMessage[], content: LeadMessageContentType, context: { name: string }): Promise<SendOutcome[]> {
  const ready = leads.map((lead) => ({ lead, to: leadAddress(lead, "email") }));
  const emails = ready.flatMap(({ lead, to }) => (to ? [leadEmail(lead, content, context, to)] : []));
  const result = emails.length ? batchOutcome(await sendEmailBatch(emails, { permissive: true }).catch(() => null), emails.length) : { kind: "sent" as const, sent: [] };
  let i = -1;
  return ready.map(({ to }) => {
    if (!to) return { status: "skipped", to: "", error: "No email address or opted out" };
    i += 1;
    if (result.kind === "sent") return { status: "sent", to };
    if (result.kind === "partial") {
      const refused = result.refused.find((r) => r.index === i);
      return refused ? { status: "failed", to, error: refused.message } : { status: "sent", to };
    }
    return { status: "failed", to, error: result.kind === "unknown" ? `No answer from the email provider (it may have gone out): ${result.message}` : result.message };
  });
}

/** Sends a test of a campaign or step to an admin's own address. */
export { sendTestMessage } from "./send.server";

// ─── Automations ────────────────────────────────────────────────────────────────────────────────────────────────

export type AutomationInput = { name: string; audience: LeadAudienceType; steps: LeadStepType[]; includeExisting: boolean };

export function listAutomations() {
  return guardGrowth(async () => {
    const automations = await db.leadAutomation.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    const ids = automations.map((a) => a.id);
    if (!ids.length) return [];
    const [enrolled, active, sent, converted] = await Promise.all([
      db.leadEnrollment.groupBy({ by: ["automationId"], where: { automationId: { in: ids } }, _count: { _all: true } }),
      db.leadEnrollment.groupBy({ by: ["automationId"], where: { automationId: { in: ids }, status: "active" }, _count: { _all: true } }),
      db.leadMessage.groupBy({ by: ["automationId"], where: { automationId: { in: ids }, status: "sent" }, _count: { _all: true } }),
      db.$queryRaw<Array<{ automationId: string; count: number }>>`
        SELECT m."automationId", count(DISTINCT m."leadId")::int AS count
        FROM "LeadMessage" m JOIN "WebsiteLead" l ON l."id" = m."leadId"
        WHERE m."automationId" IN (${Prisma.join(ids)}) AND m."status" = 'sent' AND l."convertedAt" > m."sentAt"
        GROUP BY m."automationId"`,
    ]);
    const count = (rows: Array<{ automationId: string | null; _count: { _all: number } }>, id: string) => rows.find((r) => r.automationId === id)?._count._all ?? 0;
    return automations.map((a) => ({
      ...a,
      steps: readSteps(a.steps),
      audience: readAudience(a.audience),
      enrolled: count(enrolled, a.id),
      inProgress: count(active, a.id),
      sent: count(sent, a.id),
      converted: converted.find((r) => r.automationId === a.id)?.count ?? 0,
    }));
  });
}

export function getAutomation(id: string) {
  return guardGrowth(async () => {
    const row = await db.leadAutomation.findUnique({ where: { id } });
    return row ? { ...row, steps: readSteps(row.steps), audience: readAudience(row.audience) } : null;
  });
}

function automationData(input: AutomationInput) {
  return { name: input.name, audience: input.audience as unknown as Prisma.InputJsonValue, steps: input.steps as unknown as Prisma.InputJsonValue, includeExisting: input.includeExisting };
}

export function createAutomation(input: AutomationInput) {
  return guardGrowth(() => db.leadAutomation.create({ data: automationData(input), select: { id: true } }));
}

export function updateAutomation(id: string, input: AutomationInput) {
  return guardGrowth(() => db.leadAutomation.update({ where: { id }, data: automationData(input), select: { id: true } }));
}

export function deleteAutomation(id: string) {
  return guardGrowth(() => db.leadAutomation.deleteMany({ where: { id } }));
}

/** Switching on stamps activatedAt (leads that came in before it are left out unless includeExisting). */
export function setAutomationActive(id: string, active: boolean) {
  return guardGrowth(async () => {
    const row = await db.leadAutomation.findUnique({ where: { id }, select: { activatedAt: true } });
    if (!row) return;
    await db.leadAutomation.update({ where: { id }, data: { active, ...(active && !row.activatedAt ? { activatedAt: new Date() } : {}) } });
  });
}

/** Puts matching leads into each active automation (a lead walks an automation once). */
export async function enrolLeads(options: { leadId?: string } = {}) {
  return guardGrowth(async () => {
    const automations = await db.leadAutomation.findMany({ where: { active: true } });
    let enrolled = 0;
    for (const automation of automations) {
      const steps = readSteps(automation.steps);
      if (!steps.length) continue;
      const audience = readAudience(automation.audience);
      const since = automation.includeExisting ? null : automation.activatedAt ?? automation.updatedAt;
      const base = audienceWhere(audience);
      const leads = await db.websiteLead.findMany({
        where: {
          ...base,
          ...(options.leadId ? { id: options.leadId } : {}),
          // audienceWhere may already set createdAt (sinceDays); both limits apply.
          AND: [since ? { createdAt: { gte: since } } : {}, { enrollments: { none: { automationId: automation.id } } }],
        },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
      if (!leads.length) continue;
      const result = await db.leadEnrollment.createMany({
        data: leads.map((lead) => ({ automationId: automation.id, leadId: lead.id, step: 0, nextAt: stepDueAt(steps[0], lead.createdAt) })),
        skipDuplicates: true,
      });
      enrolled += result.count;
    }
    return { enrolled };
  });
}

/** Sends every automation step that is due, until the deadline. */
export async function runDueSteps(deadline: number) {
  return guardGrowth(async () => {
    let sent = 0;
    let failed = 0;
    let finished = 0;
    let skipped = 0;
    while (Date.now() < deadline) {
      const due = await db.leadEnrollment.findMany({
        where: { status: "active", nextAt: { lte: new Date() }, automation: { active: true } },
        include: { automation: true, lead: { select: { ...LEAD_SELECT, status: true, convertedAt: true } } },
        orderBy: { nextAt: "asc" },
        take: 25,
      });
      if (!due.length) break;
      for (const enrollment of due) {
        if (Date.now() > deadline) break;
        const { lead, automation } = enrollment;
        const steps = readSteps(automation.steps);
        const step = steps[enrollment.step];
        // Signed up, closed, or out of steps: the walk ends here.
        const stop = lead.convertedAt ? "signed_up" : lead.status === "closed" || lead.status === "converted" ? "closed" : null;
        if (stop || !step) {
          await db.leadEnrollment.updateMany({ where: { id: enrollment.id, step: enrollment.step }, data: stop ? { status: "stopped", stopReason: stop } : { status: "done" } });
          finished += 1;
          continue;
        }
        // Advance first (only the run that moves it from this step sends it), then claim the message row.
        const now = new Date();
        const next = steps[enrollment.step + 1];
        const advanced = await db.leadEnrollment.updateMany({
          where: { id: enrollment.id, step: enrollment.step, status: "active" },
          data: next ? { step: enrollment.step + 1, nextAt: stepDueAt(next, now) } : { step: enrollment.step + 1, status: "done" },
        });
        if (!advanced.count) continue;
        // A dated update whose day has passed (the lead joined late, or the run was late) is skipped, not sent.
        if (stepIsStale(step, now)) {
          skipped += 1;
          if (!next) finished += 1;
          continue;
        }
        const messageId = randomUUID();
        const claim = await db.leadMessage.createMany({
          data: [{ id: messageId, leadId: lead.id, automationId: automation.id, step: enrollment.step, channel: step.channel, to: leadAddress(lead, step.channel) ?? "", status: "sending" }],
          skipDuplicates: true,
        });
        if (!claim.count) continue;
        const outcome = await sendToLead(lead, step, { name: automation.name });
        await finishMessage(messageId, lead.id, outcome);
        if (outcome.status === "sent") sent += 1;
        else if (outcome.status === "failed") failed += 1;
        if (!next) finished += 1;
      }
    }
    return { sent, failed, finished, skipped };
  });
}

/**
 * Adds the launch sequences and the seller win campaigns (src/lib/lead-growth/launch-sequences.ts) that aren't here
 * yet, matched by name. Automations come in switched off and campaigns as drafts, so an admin reads them first.
 */
export async function addLaunchContent(createdById: string) {
  const { LAUNCH_AUTOMATIONS, WIN_CAMPAIGNS } = await import("./launch-sequences");
  return guardGrowth(async () => {
    const [automations, campaigns] = await Promise.all([db.leadAutomation.findMany({ select: { name: true } }), db.leadCampaign.findMany({ select: { name: true } })]);
    const haveAutomation = new Set(automations.map((a) => a.name));
    const haveCampaign = new Set(campaigns.map((c) => c.name));
    let added = 0;
    for (const automation of LAUNCH_AUTOMATIONS) {
      if (haveAutomation.has(automation.name)) continue;
      await createAutomation(automation);
      added += 1;
    }
    for (const campaign of WIN_CAMPAIGNS) {
      if (haveCampaign.has(campaign.name)) continue;
      await createCampaign({ ...campaign.content, name: campaign.name, audience: campaign.audience }, createdById);
      added += 1;
    }
    return { added };
  });
}

// ─── Conversions and opt-outs ───────────────────────────────────────────────────────────────────────────────────

/**
 * A new account: every open lead with the same email or phone becomes "signed up", and its automations stop.
 * convertedAt is never before the lead came in, so an existing user who fills a form isn't counted as a conversion
 * of any message.
 */
export async function linkLeadsToUser(user: { id: string; email: string | null; phone: string | null; createdAt: Date }) {
  const phone = normalisePhone(user.phone);
  const or: Prisma.WebsiteLeadWhereInput[] = [];
  if (user.email) or.push({ email: { equals: user.email.trim().toLowerCase(), mode: "insensitive" } });
  if (phone) or.push({ phone });
  if (!or.length) return 0;
  return guardGrowth(async () => {
    const leads = await db.websiteLead.findMany({ where: { convertedUserId: null, OR: or }, select: { id: true, createdAt: true } });
    for (const lead of leads) {
      await db.websiteLead.update({
        where: { id: lead.id },
        data: { convertedUserId: user.id, convertedAt: lead.createdAt > user.createdAt ? lead.createdAt : user.createdAt, status: "converted" },
      });
    }
    if (leads.length) await db.leadEnrollment.updateMany({ where: { leadId: { in: leads.map((l) => l.id) }, status: "active" }, data: { status: "stopped", stopReason: "signed_up" } });
    return leads.length;
  });
}

/** Catch-up for accounts made in the last `days` days (in case the sign-up hook missed one). */
export async function matchRecentSignups(days = 3) {
  return guardGrowth(async () => {
    const users = await db.user.findMany({ where: { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } }, select: { id: true, email: true, phone: true, createdAt: true }, take: 2000 });
    let linked = 0;
    for (const user of users) linked += await linkLeadsToUser(user);
    return { linked };
  });
}

/**
 * The other way round: leads that came in recently (or one lead) from someone who already has an account, e.g. a
 * seller who signs up for the newsletter or an imported list. They count as signed up, so no campaign asks them to
 * sign up; convertedAt is the lead's own time, so no message gets the credit.
 */
export function matchLeadsToExistingUsers(options: { leadId?: string; days?: number } = {}) {
  const since = new Date(Date.now() - (options.days ?? 3) * 86_400_000);
  return guardGrowth(() =>
    db.$executeRaw`
      UPDATE "WebsiteLead" l
      SET "convertedUserId" = u."id", "convertedAt" = GREATEST(u."createdAt", l."createdAt"), "status" = 'converted', "updatedAt" = now()
      FROM "User" u
      WHERE l."convertedUserId" IS NULL
        AND ${options.leadId ? Prisma.sql`l."id" = ${options.leadId}` : Prisma.sql`l."createdAt" >= ${since}`}
        AND ((l."email" IS NOT NULL AND lower(u."email") = lower(l."email")) OR (l."phone" IS NOT NULL AND u."phone" = l."phone"))`,
  );
}

/** Called once when a brand-new account is created (src/lib/auth/app-user.ts). Never throws. */
export async function onAccountCreated(user: { id: string; supabaseId: string; email: string | null; phone: string | null; role: string; createdAt: Date }) {
  const linked = await linkLeadsToUser(user).catch(() => 0);
  await trackServerEvent({ event: "signed_up", distinctId: user.supabaseId, properties: { role: user.role, from_lead: linked > 0 } }).catch(() => undefined);
}

export function optOutLead(leadId: string, channel: LeadChannel) {
  return guardGrowth(async () => {
    const lead = await db.websiteLead.findUnique({ where: { id: leadId }, select: { optedOut: true } });
    if (!lead) return false;
    if (!lead.optedOut.includes(channel)) await db.websiteLead.update({ where: { id: leadId }, data: { optedOut: { push: channel } } });
    return true;
  });
}

/** Recent messages to one lead, for the lead's history. */
export function leadMessages(leadIds: string[]) {
  if (!leadIds.length) return Promise.resolve([]);
  return guardGrowth(() =>
    db.leadMessage.findMany({ where: { leadId: { in: leadIds } }, orderBy: { createdAt: "desc" }, take: 500, select: { leadId: true, channel: true, status: true, createdAt: true, campaign: { select: { name: true } }, automation: { select: { name: true } } } }),
  );
}

/** Everything the cron does: due campaigns, enrolments, due steps, sign-up matching. */
export async function runLeadGrowth(deadline: number) {
  const signups = await matchRecentSignups().catch((error) => ({ error: String(error) }));
  const existing = await matchLeadsToExistingUsers().catch((error) => String(error));
  const due = await guardGrowth(() => db.leadCampaign.findMany({ where: { OR: [{ status: "scheduled", scheduledAt: { lte: new Date() } }, { status: "sending" }] }, select: { id: true }, orderBy: { scheduledAt: "asc" } }));
  const campaigns: Array<{ id: string; sent: number; failed: number; done: boolean }> = [];
  for (const campaign of due) {
    if (Date.now() > deadline) break;
    campaigns.push({ id: campaign.id, ...(await runCampaign(campaign.id, deadline)) });
  }
  const enrolment = await enrolLeads();
  const steps = Date.now() < deadline ? await runDueSteps(deadline) : { sent: 0, failed: 0, finished: 0, skipped: 0 };
  return { signups, existing, campaigns, enrolment, steps };
}
