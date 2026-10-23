import "server-only";

import { db } from "@/lib/db/client";
import { addCredits } from "@/lib/ai/credits.server";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { metaTemplates, metaWhatsAppConfig, sendMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { notify } from "@/lib/notifications/notify.server";
import { setupStatus } from "@/lib/onboarding/setup-status.server";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { MEMBER_TEMPLATES, memberTemplateImageUrl } from "./whatsapp-templates";
import { WHATSAPP_TIPS_EVENT } from "./tips.server";
import { firstNameOf } from "./tips-email";
import {
  LOW_CREDITS,
  WINBACK_GIFT_CREDITS,
  WINBACK_GIFT_EVERY_DAYS,
  journeyBodyHtml,
  journeyMessage,
  monthPeriod,
  overEmailCap,
  sendingHours,
  setupStage,
  winbackPeriod,
  winbackStage,
  type JourneyKey,
  type JourneyRole,
  type JourneyVars,
} from "./journeys";

// The retention journeys (journeys.ts has the rules and words), run hourly from /api/cron/member-journeys. Off until
// an admin switches them on (Admin › Leads › Member tips, PlatformSetting "member.journeys"). Each step is a
// MemberMessage claimed before sending (kind = journey, period = the step), so it goes once.

const SETTING = "member.journeys";
const DAY = 86_400_000;
const MARKETING: JourneyKey[] = ["setup_help", "winback"];

export async function journeysOn() {
  const row = await db.platformSetting.findUnique({ where: { key: SETTING } }).catch(() => null);
  return (row?.value as { on?: boolean } | null)?.on === true;
}

export async function setJourneysOn(on: boolean, userId: string) {
  const value = { on, updatedBy: userId, updatedAt: new Date().toISOString() };
  await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value }, update: { value } });
}

type Person = { id: string; name: string | null; email: string | null; phone: string | null; role: string };

async function claim(userId: string, kind: JourneyKey, period: string, ref: string, channel = "email") {
  try {
    return await db.memberMessage.create({ data: { userId, kind, period, ref, channel } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

async function emailsLastWeek(userId: string, now: Date) {
  return db.memberMessage.count({ where: { userId, channel: "email", status: "sent", sentAt: { gte: new Date(now.getTime() - 7 * DAY) } } });
}

async function whatsappOff(userId: string) {
  const row = await db.notificationPreference.findUnique({ where: { userId_eventKey_category: { userId, eventKey: WHATSAPP_TIPS_EVENT, category: "system" } } }).catch(() => null);
  return row ? !row.whatsapp : false;
}

let approvedCache: { at: number; names: Set<string> } | null = null;
async function approvedTemplates() {
  if (approvedCache && Date.now() - approvedCache.at < 10 * 60_000) return approvedCache.names;
  const config = metaWhatsAppConfig();
  const list = config ? await metaTemplates(config) : null;
  const names = new Set(list?.ok ? list.templates.filter((t) => t.status === "APPROVED").map((t) => t.name) : []);
  approvedCache = { at: Date.now(), names };
  return names;
}

/** Sends one journey step: bell, email (and WhatsApp for the two that have a template). */
async function deliver(person: Person, key: JourneyKey, stage: string, period: string, vars: JourneyVars, now: Date, whatsapp?: { template: string; params: string[] }) {
  const role = person.role as JourneyRole;
  const row = await claim(person.id, key, period, stage);
  if (!row) return "claimed";
  const message = journeyMessage(key, stage, role, vars);
  const marketing = MARKETING.includes(key);
  try {
    await notify({
      userId: person.id,
      event: `member.${key}`,
      category: key === "credits_low" ? "account" : "marketing",
      priority: key === "first_win" ? "success" : "info",
      title: message.title,
      description: message.description,
      link: message.cta.path,
      dedupeKey: `journey-${key}-${period}`,
      inAppOnly: true,
    }).catch(() => undefined);

    let emailed = false;
    let error: string | null = null;
    if (person.email && !(marketing && overEmailCap(await emailsLastWeek(person.id, now)))) {
      const sent = await sendPlatformEmail({
        to: person.email,
        user: { id: person.id, role },
        kind: marketing ? "lifecycle" : "notification",
        ...(marketing ? { topic: "lifecycle" as const } : {}),
        subject: message.subject,
        preheader: message.preheader,
        eyebrow: message.eyebrow,
        heading: message.heading,
        bodyHtml: journeyBodyHtml(message),
        cta: { label: message.cta.label, url: `${appBase()}${message.cta.path}` },
      });
      emailed = sent.success;
      if (!sent.success) error = sent.message ?? "email failed";
    }

    if (whatsapp && person.phone && (await approvedTemplates()).has(whatsapp.template) && !(await whatsappOff(person.id))) {
      const template = MEMBER_TEMPLATES.find((t) => t.name === whatsapp.template);
      const config = metaWhatsAppConfig();
      if (template && config) {
        const sent = await sendMetaTemplate(config, { to: person.phone, template: template.name, language: template.language, params: whatsapp.params, headerImage: memberTemplateImageUrl(template) });
        if (!sent.ok) console.warn(`[journeys] WhatsApp ${template.name} not sent: ${sent.error}`);
      }
    }
    await db.memberMessage.update({ where: { id: row.id }, data: { status: emailed ? "sent" : error ? "failed" : "skipped", error, sentAt: emailed ? new Date() : null } });
    return emailed ? "sent" : "skipped";
  } catch (caught) {
    await db.memberMessage.update({ where: { id: row.id }, data: { status: "failed", error: caught instanceof Error ? caught.message.slice(0, 500) : "failed" } }).catch(() => undefined);
    return "failed";
  }
}

const PERSON = { id: true, name: true, email: true, phone: true, role: true } as const;

async function notYet(userIds: string[], kind: JourneyKey, periods: (id: string) => string) {
  if (!userIds.length) return new Set<string>();
  const done = await db.memberMessage.findMany({ where: { userId: { in: userIds }, kind }, select: { userId: true, period: true } });
  const seen = new Set(done.map((row) => `${row.userId}|${row.period}`));
  return new Set(userIds.filter((id) => !seen.has(`${id}|${periods(id)}`)));
}

// ─── Each journey ─────────────────────────────────────────────────────────────

async function runSetupHelp(now: Date, deadline: number) {
  let count = 0;
  const people = await db.user.findMany({
    where: { role: { in: ["supplier", "logistics_partner"] }, verificationStatus: { not: "suspended" }, createdAt: { gte: new Date(now.getTime() - 20 * DAY), lte: new Date(now.getTime() - 3 * DAY) } },
    select: { ...PERSON, createdAt: true },
    take: 500,
  });
  const stageOf = new Map(people.map((p) => [p.id, setupStage(p.createdAt, now)]));
  const open = await notYet(people.map((p) => p.id), "setup_help", (id) => stageOf.get(id) ?? "");
  for (const person of people) {
    if (Date.now() > deadline) break;
    const stage = stageOf.get(person.id);
    if (!stage || !open.has(person.id)) continue;
    const status = await setupStatus(person.id).catch(() => null);
    if (!status?.next) {
      await claim(person.id, "setup_help", stage, "done").then((row) => row && db.memberMessage.update({ where: { id: row.id }, data: { status: "skipped", error: "Setup finished" } }));
      continue;
    }
    const vars = { firstName: firstNameOf(person.name), nextStep: status.next, done: status.done, total: status.steps.length };
    const result = await deliver(person, "setup_help", stage, stage, vars, now, stage === "d3" ? { template: "shopinbos_setup_help", params: [vars.firstName, status.next.label.toLowerCase()] } : undefined);
    if (result === "sent") count++;
  }
  return count;
}

async function runWinback(now: Date, deadline: number) {
  let count = 0;
  const rows = await db.$queryRaw<Array<{ userId: string; last: Date }>>`
    SELECT a."userId", MAX(a."day") AS last
    FROM "UserActivityDay" a
    WHERE a."role" IN ('seller', 'supplier', 'logistics_partner')
    GROUP BY a."userId"
    HAVING MAX(a."day") BETWEEN ${new Date(now.getTime() - 46 * DAY)} AND ${new Date(now.getTime() - 7 * DAY)}
    LIMIT 2000`;
  if (!rows.length) return 0;
  const lastOf = new Map(rows.map((row) => [row.userId, new Date(row.last)]));
  const periodOf = (id: string) => {
    const last = lastOf.get(id)!;
    const stage = winbackStage(last, now);
    return stage ? winbackPeriod(last.toISOString().slice(0, 10), stage) : "";
  };
  const open = await notYet([...lastOf.keys()], "winback", periodOf);
  const people = await db.user.findMany({ where: { id: { in: [...open] }, verificationStatus: { not: "suspended" }, createdAt: { lte: new Date(now.getTime() - 14 * DAY) } }, select: PERSON });
  for (const person of people) {
    if (Date.now() > deadline) break;
    const last = lastOf.get(person.id)!;
    const stage = winbackStage(last, now);
    if (!stage) continue;
    const period = winbackPeriod(last.toISOString().slice(0, 10), stage);
    let giftCredits = 0;
    if (stage === "d14") {
      const recentGift = await db.memberMessage.count({ where: { userId: person.id, kind: "winback", ref: "d14-gift", createdAt: { gte: new Date(now.getTime() - WINBACK_GIFT_EVERY_DAYS * DAY) } } });
      if (!recentGift) {
        // The gift's own row first (unique per quiet spell): only the run that writes it adds the credits.
        const gift = await db.memberMessage.create({ data: { userId: person.id, kind: "winback", period: `${period}:gift`, ref: "d14-gift", channel: "credits", status: "sent", sentAt: now } }).catch(() => null);
        if (gift) {
          await addCredits(person.id, WINBACK_GIFT_CREDITS, "grant", `winback-${person.id}-${period}`).catch(() => undefined);
          giftCredits = WINBACK_GIFT_CREDITS;
        }
      }
    }
    const firstName = firstNameOf(person.name);
    const whatsapp = stage === "d14"
      ? { template: "shopinbos_welcome_back", params: [firstName, giftCredits ? `We've added ${giftCredits} free AI credits to your account for Rex videos and product photos.` : "Your account is just as you left it."] }
      : undefined;
    const result = await deliver(person, "winback", stage, period, { firstName, giftCredits }, now, whatsapp);
    if (result === "sent") count++;
  }
  return count;
}

async function runFirstWins(now: Date, deadline: number) {
  let count = 0;
  const since = new Date(now.getTime() - 14 * DAY);
  // Their first one happened in the last two weeks (older accounts don't get a late "first" message).
  const sellers = await db.$queryRaw<Array<{ userId: string }>>`
    SELECT s."userId" FROM "RetailOrder" o JOIN "Store" s ON s."id" = o."storeId"
    WHERE o."status"::text IN (${PAID_ORDER_STATUSES[0]}, ${PAID_ORDER_STATUSES[1]}, ${PAID_ORDER_STATUSES[2]}, ${PAID_ORDER_STATUSES[3]}, ${PAID_ORDER_STATUSES[4]})
    GROUP BY s."userId" HAVING MIN(o."createdAt") >= ${since} LIMIT 500`;
  const suppliers = await db.$queryRaw<Array<{ userId: string }>>`
    SELECT p."userId" FROM "SupplierOrder" o JOIN "Supplier" p ON p."id" = o."supplierId"
    WHERE o."acceptedAt" IS NOT NULL
    GROUP BY p."userId" HAVING MIN(o."acceptedAt") >= ${since} LIMIT 500`;
  const partners = await db.$queryRaw<Array<{ userId: string }>>`
    SELECT p."userId" FROM "DeliveryBooking" b JOIN "LogisticsPartner" p ON p."id" = b."logisticsPartnerId"
    WHERE b."status"::text = 'delivered'
    GROUP BY p."userId" HAVING MIN(COALESCE(b."deliveredAt", b."createdAt")) >= ${since} LIMIT 500`;
  const ids = [...new Set([...sellers, ...suppliers, ...partners].map((row) => row.userId))];
  const open = await notYet(ids, "first_win", () => "once");
  const people = await db.user.findMany({ where: { id: { in: [...open] } }, select: PERSON });
  for (const person of people) {
    if (Date.now() > deadline) break;
    if (!["seller", "supplier", "logistics_partner"].includes(person.role)) continue;
    const result = await deliver(person, "first_win", "once", "once", { firstName: firstNameOf(person.name) }, now);
    if (result === "sent") count++;
  }
  return count;
}

async function runCreditsLow(now: Date, deadline: number) {
  let count = 0;
  const period = monthPeriod(now);
  const accounts = await db.$queryRaw<Array<{ userId: string; left: number }>>`
    SELECT c."userId", (c."balance" + c."planCredits")::int AS left
    FROM "AiCreditAccount" c JOIN "User" u ON u."id" = c."userId"
    WHERE (c."balance" + c."planCredits") < ${LOW_CREDITS}
      AND c."updatedAt" >= ${new Date(now.getTime() - 30 * DAY)}
      AND u."role"::text IN ('seller', 'supplier', 'logistics_partner')
    LIMIT 500`;
  const leftOf = new Map(accounts.map((row) => [row.userId, Number(row.left)]));
  const open = await notYet([...leftOf.keys()], "credits_low", () => period);
  const people = await db.user.findMany({ where: { id: { in: [...open] } }, select: PERSON });
  for (const person of people) {
    if (Date.now() > deadline) break;
    const result = await deliver(person, "credits_low", "month", period, { firstName: firstNameOf(person.name), creditsLeft: leftOf.get(person.id) ?? 0 }, now);
    if (result === "sent") count++;
  }
  return count;
}

/** The hourly journeys run. Celebrations and low credits go any time; the marketing ones only in sending hours. */
export async function runJourneys(now = new Date(), deadline = Date.now() + 240_000) {
  if (!(await journeysOn())) return { on: false };
  const firstWins = await runFirstWins(now, deadline);
  const creditsLow = await runCreditsLow(now, deadline);
  if (!sendingHours(now)) return { on: true, firstWins, creditsLow, setupHelp: 0, winback: 0, note: "outside sending hours" };
  const setupHelp = await runSetupHelp(now, deadline);
  const winback = await runWinback(now, deadline);
  return { on: true, firstWins, creditsLow, setupHelp, winback };
}

/** Admin: how many of each journey went out in the last 30 days. */
export async function journeyStats(now = new Date()) {
  const rows = await db.memberMessage
    .groupBy({ by: ["kind", "status"], where: { kind: { in: ["setup_help", "winback", "first_win", "credits_low", "announce_referral"] }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _count: { _all: true } })
    .catch(() => []);
  const of = (kind: string, status: string) => rows.find((row) => row.kind === kind && row.status === status)?._count._all ?? 0;
  return (["setup_help", "winback", "first_win", "credits_low", "announce_referral"] as const).map((kind) => ({ kind, sent: of(kind, "sent"), failed: of(kind, "failed"), skipped: of(kind, "skipped") }));
}
