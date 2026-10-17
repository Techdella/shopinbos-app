import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { sendSms, sendWhatsAppMessage } from "@/lib/notifications/service";
import {
  STRIKE_POINTS,
  lateLevel,
  nairaWords,
  overdueCardWords,
  payInConfig,
  payInMessage,
  payInPosition,
  planPayInStanding,
  type PayInAccountWords,
  type PayInConfig,
  type PayInStanding,
  type PayInStep,
} from "./payin-deadline";

// Late pay-ins, on the server (rules in payin-deadline.ts): works out where a partner stands, saves the new
// standing (flag, pause, escalation, strikes, clear) and sends each message once. Called by
//   - /api/cron/partner-payins every 15 minutes (runPartnerPayInSweep: reminders, flags, escalation), and
//   - every pay-in path right after it settles jobs (remittances.ts, payins.server.ts), so paying in unpauses at once.
// Safe to run any number of times: the partner row is locked while the standing is worked out, and each step's
// key is saved in PartnerPayInEvent before anything is sent (a key that's already there sends nothing).

type Tx = Prisma.TransactionClient;

const STANDING_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  whatsappNumber: true,
  payInCredit: true,
  reliabilityScore: true,
  codPaused: true,
  payInOverdueSince: true,
  payInOverdueAmount: true,
  payInEscalatedAt: true,
  payInReviewAt: true,
  payInPauseWaived: true,
  payInStrikes: true,
} as const;

/** Unpaid cash jobs (cash collected, no pay-in yet), oldest first. */
export const UNPAID_CASH_WHERE = { codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } } as const;

async function standingTx(tx: Tx, partnerId: string, now: Date, config: PayInConfig) {
  await tx.$queryRaw`SELECT "id" FROM "LogisticsPartner" WHERE "id" = ${partnerId} FOR UPDATE`;
  const partner = await tx.logisticsPartner.findUnique({ where: { id: partnerId }, select: STANDING_SELECT });
  if (!partner) return null;
  const jobs = await tx.deliveryBooking.findMany({
    where: { logisticsPartnerId: partnerId, ...UNPAID_CASH_WHERE },
    orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
    select: { codCollected: true, codCollectedAt: true, deliveredAt: true, createdAt: true },
  });
  const position = payInPosition(jobs, partner.payInCredit, now, config);
  const current: PayInStanding = {
    codPaused: partner.codPaused,
    payInOverdueSince: partner.payInOverdueSince,
    payInOverdueAmount: partner.payInOverdueAmount,
    payInEscalatedAt: partner.payInEscalatedAt,
    payInReviewAt: partner.payInReviewAt,
    payInPauseWaived: partner.payInPauseWaived,
  };
  const plan = planPayInStanding({ partnerId, standing: current, position, now, config });

  // Save every step's key; only the ones that weren't there yet come back, and only those act.
  const fresh = plan.steps.length
    ? await tx.partnerPayInEvent.createManyAndReturn({
        data: plan.steps.map((step) => ({ logisticsPartnerId: partnerId, kind: step.kind, dedupeKey: step.key, amount: step.amount, deadline: step.deadline })),
        skipDuplicates: true,
        select: { dedupeKey: true },
      })
    : [];
  const freshKeys = new Set(fresh.map((row) => row.dedupeKey));
  const newSteps = plan.steps.filter((step) => freshKeys.has(step.key));
  const strikes = newSteps.filter((step) => step.kind === "strike").length;

  // A late period that just cleared: close its keys, so a later late period with the same missed deadline (cash from
  // that day recorded after they paid) is a new period with its own messages, not silently re-flagged.
  const cleared = newSteps.find((step) => step.kind === "cleared");
  if (cleared) {
    const closed = `:closed:${now.toISOString()}`;
    await tx.$executeRaw`UPDATE "PartnerPayInEvent" SET "dedupeKey" = "dedupeKey" || ${closed}
      WHERE "logisticsPartnerId" = ${partnerId} AND "kind" IN ('overdue', 'escalated', 'review', 'strike', 'cleared')
        AND "deadline" = ${cleared.deadline} AND "dedupeKey" NOT LIKE '%:closed:%'`;
  }

  if (plan.changed || strikes) {
    await tx.logisticsPartner.update({
      where: { id: partnerId },
      data: {
        ...plan.standing,
        ...(strikes ? { payInStrikes: { increment: strikes }, reliabilityScore: Math.max(0, partner.reliabilityScore - strikes * STRIKE_POINTS) } : {}),
      },
    });
  }
  return { partner, position, standing: plan.standing, newSteps };
}

async function adminIds() {
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 20 }).catch(() => []);
  return admins.map((admin) => admin.id);
}

async function notifyAdmins(input: { title: string; description: string; link: string; priority: "info" | "warning" | "critical"; metadata?: Record<string, unknown> }) {
  for (const userId of await adminIds()) {
    await createNotification({ userId, type: "logistics", ...input, sendEmail: input.priority === "critical", event: "admin.alert" }).catch(() => null);
  }
}

/** WhatsApp first, SMS if WhatsApp isn't set up or fails. Never throws. */
async function messagePartnerPhone(partner: { id: string; whatsappNumber: string | null; userId: string }, text: string) {
  try {
    const user = await db.user.findUnique({ where: { id: partner.userId }, select: { phone: true } });
    const whatsapp = partner.whatsappNumber?.trim();
    const phone = user?.phone?.trim() || whatsapp;
    if (whatsapp) {
      const sent = await sendWhatsAppMessage({ to: [whatsapp], message: text }).catch(() => null);
      if (sent?.success) return "whatsapp";
    }
    if (phone) {
      const sent = await sendSms({ to: [phone], message: text.slice(0, 300) }).catch(() => null);
      if (sent?.success) return "sms";
    }
  } catch (error) {
    console.warn(`[pay-in deadline] could not message partner ${partner.id}`, error);
  }
  return null;
}

async function payInAccountWords(partnerId: string): Promise<PayInAccountWords | null> {
  const account = await db.partnerPayInAccount.findUnique({ where: { logisticsPartnerId: partnerId }, select: { status: true, accountNumber: true, bankName: true } }).catch(() => null);
  return account?.status === "assigned" && account.accountNumber ? { accountNumber: account.accountNumber, bankName: account.bankName ?? "" } : null;
}

/** Riders holding the cash, for the team: "Tunde ₦12,000 · Bayo ₦4,500". */
export async function ridersHolding(partnerId: string) {
  const jobs = await db.deliveryBooking.findMany({ where: { logisticsPartnerId: partnerId, ...UNPAID_CASH_WHERE }, select: { codCollected: true, rider: { select: { name: true } } } });
  const byRider = new Map<string, number>();
  for (const job of jobs) byRider.set(job.rider?.name ?? "No rider", (byRider.get(job.rider?.name ?? "No rider") ?? 0) + (job.codCollected ?? 0));
  return [...byRider.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }));
}

async function sendSteps(partner: { id: string; userId: string; displayName: string; whatsappNumber: string | null }, steps: PayInStep[], standing: PayInStanding, now: Date, config: PayInConfig) {
  const talk = steps.filter((step) => step.kind !== "strike");
  if (!talk.length) return;
  const account = await payInAccountWords(partner.id);
  const adminLink = `/admin/logistics-partners/${partner.id}#late-payin`;
  for (const step of talk) {
    try {
      if (step.kind === "reminder" || step.kind === "overdue" || step.kind === "escalated" || step.kind === "cleared") {
        const message = payInMessage(step.kind, { amount: step.amount, deadline: step.deadline, account, config, now });
        await createNotification({
          userId: partner.userId,
          type: "logistics",
          priority: step.kind === "cleared" ? "success" : step.kind === "reminder" ? "info" : "warning",
          title: message.title,
          description: message.body,
          link: "/logistics/cash",
          actionLabel: step.kind === "cleared" ? "See jobs" : "Pay in",
          actionUrl: step.kind === "cleared" ? "/logistics/dashboard" : "/logistics/cash",
          metadata: { payInStep: step.kind, key: step.key },
          sendEmail: true,
          event: step.kind === "reminder" ? "payin.reminder" : step.kind === "cleared" ? "payin.received" : "payin.overdue",
          dedupeKey: `payin.${step.kind}:${step.key}`,
          phoneHandled: true,
        }).catch(() => null);
        await messagePartnerPhone(partner, `Shopinbos: ${message.title.replace(/\.$/, "")}. ${message.body}`);
      }
      if (step.kind === "overdue" || step.kind === "escalated" || step.kind === "review") {
        const riders = await ridersHolding(partner.id);
        const holding = riders.length ? ` Riders holding it: ${riders.map((rider) => `${rider.name} ${nairaWords(rider.amount)}`).join(", ")}.` : "";
        const title =
          step.kind === "review"
            ? `Review ${partner.displayName}: 3 days late paying in ${nairaWords(step.amount)}`
            : step.kind === "escalated"
            ? `High priority: ${partner.displayName} is a day late paying in ${nairaWords(step.amount)}`
            : `${partner.displayName} is late paying in ${nairaWords(step.amount)}`;
        const description =
          step.kind === "review"
            ? `Still not paid in after 72 hours. They're ${standing.codPaused ? "paused from" : "still getting"} cash-on-delivery jobs. Decide what happens next: nothing is suspended automatically.${holding}`
            : `${standing.codPaused ? "Paused from new cash-on-delivery jobs until they pay in." : "You unpaused them, so they still get cash-on-delivery jobs."}${holding}`;
        await notifyAdmins({ title, description, link: adminLink, priority: step.kind === "overdue" ? "warning" : "critical", metadata: { payInStep: step.kind, partnerId: partner.id, level: lateLevel(standing) } });
      }
      if (step.kind === "cleared") {
        await notifyAdmins({ title: `${partner.displayName} is back to getting all jobs`, description: "Their late cash is paid in, so the pause on cash-on-delivery jobs is off.", link: adminLink, priority: "info" });
      }
    } catch (error) {
      console.error(`[pay-in deadline] could not send ${step.key}`, error);
    }
  }
}

export interface RefreshResult {
  partnerId: string;
  standing: PayInStanding;
  owed: number;
  steps: string[];
}

/**
 * Works out the partner's standing now and acts on anything new. Idempotent. Call after anything that changes
 * what a partner owes (a pay-in matched or recorded, the team settling it) and from the cron.
 */
export async function refreshPayInStanding(partnerId: string, now: Date = new Date(), config: PayInConfig = payInConfig()): Promise<RefreshResult | null> {
  const result = await db.$transaction((tx) => standingTx(tx, partnerId, now, config));
  if (!result) return null;
  await sendSteps(result.partner, result.newSteps, result.standing, now, config);
  return { partnerId, standing: result.standing, owed: result.position.owed, steps: result.newSteps.map((step) => step.kind) };
}

/** refreshPayInStanding that never throws (pay-in paths call it after they've already saved the money). */
export async function refreshPayInStandingSafely(partnerId: string) {
  try {
    return await refreshPayInStanding(partnerId);
  } catch (error) {
    console.error(`[pay-in deadline] partner ${partnerId} standing could not be refreshed`, error);
    return null;
  }
}

/** The cron: every partner holding unpaid cash or still flagged. */
export async function runPartnerPayInSweep(now: Date = new Date(), config: PayInConfig = payInConfig()) {
  const [holding, flagged] = await Promise.all([
    // A seller's own riders (ownerId) hand cash to the seller, not to Shopinbos: never a pay-in.
    db.deliveryBooking.findMany({ where: { ...UNPAID_CASH_WHERE, logisticsPartner: { ownerId: null } }, distinct: ["logisticsPartnerId"], select: { logisticsPartnerId: true }, take: 5000 }),
    db.logisticsPartner.findMany({ where: { OR: [{ codPaused: true }, { payInOverdueSince: { not: null } }] }, select: { id: true }, take: 5000 }),
  ]);
  const ids = [...new Set([...holding.map((row) => row.logisticsPartnerId), ...flagged.map((row) => row.id)])];
  const counts = { partners: ids.length, reminder: 0, overdue: 0, escalated: 0, review: 0, strike: 0, cleared: 0, failed: 0 };
  for (const id of ids) {
    try {
      const result = await refreshPayInStanding(id, now, config);
      for (const step of result?.steps ?? []) counts[step as keyof typeof counts] += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(`[cron partner-payins] partner ${id} failed`, error);
    }
  }
  return counts;
}

/**
 * The late pay-in card for the partner's screens (Today and Cash, web and app), or null when nothing is overdue:
 * "₦X overdue since yesterday 6pm. You're paused from cash-on-delivery jobs until you pay in." plus their account.
 */
export async function payInOverdueView(partnerId: string, now: Date = new Date()) {
  const partner = await db.logisticsPartner.findUnique({
    where: { id: partnerId },
    select: { codPaused: true, payInOverdueSince: true, payInOverdueAmount: true },
  });
  if (!partner?.payInOverdueSince || partner.payInOverdueAmount <= 0) return null;
  const account = await db.partnerPayInAccount.findUnique({ where: { logisticsPartnerId: partnerId }, select: { status: true, accountNumber: true, bankName: true, accountName: true } }).catch(() => null);
  const words = overdueCardWords({ amount: partner.payInOverdueAmount, since: partner.payInOverdueSince, paused: partner.codPaused, now });
  return {
    amount: partner.payInOverdueAmount,
    since: partner.payInOverdueSince.toISOString(),
    paused: partner.codPaused,
    title: words.title,
    body: words.body,
    account: account?.status === "assigned" && account.accountNumber ? { accountNumber: account.accountNumber, bankName: account.bankName ?? "", accountName: account.accountName ?? "" } : null,
  };
}

/** Admin "Late pay-ins": every partner flagged now, longest late first, with the riders holding the cash. */
export async function latePayInRows(limit = 100) {
  const partners = await db.logisticsPartner.findMany({
    where: { payInOverdueSince: { not: null } },
    orderBy: { payInOverdueSince: "asc" },
    take: limit,
    select: { id: true, displayName: true, city: true, codPaused: true, payInOverdueSince: true, payInOverdueAmount: true, payInEscalatedAt: true, payInReviewAt: true, payInStrikes: true },
  });
  const jobs = partners.length
    ? await db.deliveryBooking.findMany({
        where: { logisticsPartnerId: { in: partners.map((partner) => partner.id) }, ...UNPAID_CASH_WHERE },
        select: { logisticsPartnerId: true, codCollected: true, rider: { select: { name: true } } },
      })
    : [];
  return partners.map((partner) => {
    const byRider = new Map<string, number>();
    for (const job of jobs) {
      if (job.logisticsPartnerId !== partner.id) continue;
      const name = job.rider?.name ?? "No rider";
      byRider.set(name, (byRider.get(name) ?? 0) + (job.codCollected ?? 0));
    }
    return {
      id: partner.id,
      displayName: partner.displayName,
      city: partner.city,
      amount: partner.payInOverdueAmount,
      since: partner.payInOverdueSince!,
      codPaused: partner.codPaused,
      escalatedAt: partner.payInEscalatedAt,
      reviewAt: partner.payInReviewAt,
      strikes: partner.payInStrikes,
      riders: [...byRider.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
    };
  });
}
