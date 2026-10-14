// Late cash pay-ins from delivery partners (spec 7.4: "Partners pay in by 6pm same day … Late → partner flagged,
// new COD jobs paused, admin alerted"). Pure (only payin-rules), unit-tested in tests/payin-deadline.test.mjs.
//
// The rule:
//   - Cash a rider collects on a cash-on-delivery job is due by the cut-off (6pm Lagos) that day; cash collected
//     after the cut-off is due by the cut-off the next day (payin-rules payInDeadline).
//   - Two hours before a deadline, a partner who still owes cash due by then gets one reminder.
//   - Once a deadline plus the grace (60 minutes) has passed with cash still owed after credit, the partner is
//     flagged: payInOverdueSince = that deadline, and paused from new cash-on-delivery jobs only (codPaused).
//     Prepaid jobs and jobs they already have carry on. This is not the "Taking new jobs" switch, so the partner
//     can't switch it off; paying in does.
//   - 24 hours late: told again, high priority for the team. 72 hours late: flagged for the team to review (the
//     team decides; nothing is suspended automatically). Every started day late is a strike against reliability.
//   - As soon as pay-ins (matched transfers, a pay-in the team records, or the team's "Mark as settled") bring
//     the overdue cash to zero, the flag and the pause clear and the partner is told.
// Every message has a dedupe key (kind + partner + deadline), saved once in PartnerPayInEvent, so the cron (every
// 15 minutes) and the pay-in hooks can run any number of times without repeating anything.

import { hourWords, owedAfterCredit, payInDeadline } from "./payin-rules.ts";
import type { TFunction } from "@shared/i18n";

/** Optional translate function from a partner page ("logistics" namespace, payinWords.* keys). Without it, English. */
type Translate = Pick<TFunction, "dynamic">;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const LAGOS_OFFSET_MS = HOUR_MS;

/** Told again and high priority for the team after this long late. */
export const ESCALATE_AFTER_MS = 24 * HOUR_MS;
/** Flagged for the team to review after this long late. */
export const REVIEW_AFTER_MS = 72 * HOUR_MS;
/** Reminder this long before the cut-off ("Pay in ₦X by 6pm" at 4pm). */
export const REMINDER_BEFORE_MS = 2 * HOUR_MS;
/** Reliability points taken off for each day late (reliabilityScore is 0–100). */
export const STRIKE_POINTS = 5;

export interface PayInConfig {
  /** Hour of the day in Lagos (0–23) cash is due by. PARTNER_PAYIN_CUTOFF_HOUR, default 18 (6pm). */
  cutoffHour: number;
  /** Minutes after the cut-off before a partner counts as late. PARTNER_PAYIN_GRACE_MINUTES, default 60. */
  graceMinutes: number;
}

function intFrom(value: string | undefined, fallback: number, min: number, max: number) {
  const raw = value?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const number = Number(raw);
  return number >= min && number <= max ? number : fallback;
}

export function payInConfig(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): PayInConfig {
  return {
    cutoffHour: intFrom(env.PARTNER_PAYIN_CUTOFF_HOUR, 18, 0, 23),
    graceMinutes: intFrom(env.PARTNER_PAYIN_GRACE_MINUTES, 60, 0, 24 * 60),
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A cash job not paid in yet (codMethod "cash", no remittance), oldest first. */
export interface CashJob {
  codCollected: number | null;
  codCollectedAt: Date | null;
  deliveredAt?: Date | null;
  createdAt: Date;
}

export const collectedAt = (job: CashJob) => job.codCollectedAt ?? job.deliveredAt ?? job.createdAt;

/** The cut-off this job's cash is due by. */
export const jobDeadline = (job: CashJob, config: PayInConfig) => payInDeadline(collectedAt(job), config.cutoffHour);

/** True once the deadline and the grace after it have passed. */
export const pastGrace = (deadline: Date, now: Date, config: PayInConfig) => now.getTime() >= deadline.getTime() + config.graceMinutes * MINUTE_MS;

export interface PayInPosition {
  /** All cash still to pay in after credit. */
  owed: number;
  /** Cash past its deadline and grace, after credit; since = the oldest such deadline. */
  overdue: { amount: number; since: Date | null };
  /** The next deadline still ahead (or inside its grace) and the cash due by it after credit. */
  next: { deadline: Date; amount: number } | null;
}

/**
 * Where a partner stands. Credit is what's left of earlier pay-ins after settling whole jobs (always less than the
 * oldest unpaid job), so it counts against the oldest cash first.
 */
export function payInPosition(jobs: CashJob[], credit: number, now: Date, config: PayInConfig): PayInPosition {
  const withDeadline = jobs
    .filter((job) => (job.codCollected ?? 0) > 0)
    .map((job) => ({ cash: job.codCollected ?? 0, deadline: jobDeadline(job, config) }))
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  const total = round2(withDeadline.reduce((sum, job) => sum + job.cash, 0));
  const late = withDeadline.filter((job) => pastGrace(job.deadline, now, config));
  const lateCash = round2(late.reduce((sum, job) => sum + job.cash, 0));
  const overdueAmount = owedAfterCredit(lateCash, credit);
  const upcoming = withDeadline.find((job) => !pastGrace(job.deadline, now, config));
  let next: PayInPosition["next"] = null;
  if (upcoming) {
    const dueBy = round2(withDeadline.filter((job) => job.deadline.getTime() <= upcoming.deadline.getTime()).reduce((sum, job) => sum + job.cash, 0));
    next = { deadline: upcoming.deadline, amount: owedAfterCredit(dueBy, credit) };
  }
  return {
    owed: owedAfterCredit(total, credit),
    overdue: { amount: overdueAmount, since: overdueAmount > 0 && late[0] ? late[0].deadline : null },
    next,
  };
}

/** What's stored on the partner (LogisticsPartner). */
export interface PayInStanding {
  codPaused: boolean;
  payInOverdueSince: Date | null;
  payInOverdueAmount: number;
  payInEscalatedAt: Date | null;
  payInReviewAt: Date | null;
  payInPauseWaived: boolean;
}

export const CLEAR_STANDING: PayInStanding = {
  codPaused: false,
  payInOverdueSince: null,
  payInOverdueAmount: 0,
  payInEscalatedAt: null,
  payInReviewAt: null,
  payInPauseWaived: false,
};

export type PayInStepKind = "reminder" | "overdue" | "escalated" | "review" | "strike" | "cleared";

export interface PayInStep {
  kind: PayInStepKind;
  /** Unique per partner and deadline (and day, for strikes): saved once, so nothing repeats. */
  key: string;
  amount: number;
  deadline: Date;
}

/** "overdue:<partner>:<deadline ISO>", "strike:<partner>:<deadline ISO>:2", "reminder:<partner>:<deadline ISO>". */
export function payInKey(kind: PayInStepKind | "recheck" | "settled" | "unpaused", partnerId: string, at: Date, n?: number) {
  return `${kind}:${partnerId}:${at.toISOString()}${n === undefined ? "" : `:${n}`}`;
}

/** Started days late: 1 from the moment the partner is flagged, 2 after 24 hours, and so on. */
export function lateDays(since: Date, now: Date) {
  const late = now.getTime() - since.getTime();
  return late < 0 ? 0 : Math.floor(late / DAY_MS) + 1;
}

const sameInstant = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * The next standing and the steps to take (each step happens once: the caller saves its key first and only acts
 * when the key was new). Pure and idempotent: running it again with the standing it returned yields the same
 * standing and the same keys.
 */
export function planPayInStanding(input: { partnerId: string; standing: PayInStanding; position: PayInPosition; now: Date; config: PayInConfig }): {
  standing: PayInStanding;
  steps: PayInStep[];
  changed: boolean;
} {
  const { partnerId, standing, position, now } = input;
  const steps: PayInStep[] = [];
  let next: PayInStanding;

  if (position.overdue.amount > 0 && position.overdue.since) {
    // Keep the first missed deadline while the partner stays late, so "since" and the escalation clock don't move.
    const since = standing.payInOverdueSince ?? position.overdue.since;
    const lateFor = now.getTime() - since.getTime();
    const amount = position.overdue.amount;
    next = {
      codPaused: !standing.payInPauseWaived,
      payInOverdueSince: since,
      payInOverdueAmount: amount,
      payInEscalatedAt: lateFor >= ESCALATE_AFTER_MS ? standing.payInEscalatedAt ?? now : null,
      payInReviewAt: lateFor >= REVIEW_AFTER_MS ? standing.payInReviewAt ?? now : null,
      payInPauseWaived: standing.payInPauseWaived,
    };
    steps.push({ kind: "overdue", key: payInKey("overdue", partnerId, since), amount, deadline: since });
    if (lateFor >= ESCALATE_AFTER_MS) steps.push({ kind: "escalated", key: payInKey("escalated", partnerId, since), amount, deadline: since });
    if (lateFor >= REVIEW_AFTER_MS) steps.push({ kind: "review", key: payInKey("review", partnerId, since), amount, deadline: since });
    for (let day = 1; day <= lateDays(since, now); day += 1) {
      steps.push({ kind: "strike", key: payInKey("strike", partnerId, since, day), amount, deadline: since });
    }
  } else if (standing.payInOverdueSince || standing.codPaused) {
    const since = standing.payInOverdueSince ?? now;
    next = { ...CLEAR_STANDING };
    steps.push({ kind: "cleared", key: payInKey("cleared", partnerId, since), amount: 0, deadline: since });
  } else {
    next = { ...CLEAR_STANDING };
    const upcoming = position.next;
    if (upcoming && upcoming.amount > 0 && now.getTime() >= upcoming.deadline.getTime() - REMINDER_BEFORE_MS && now.getTime() < upcoming.deadline.getTime()) {
      steps.push({ kind: "reminder", key: payInKey("reminder", partnerId, upcoming.deadline), amount: upcoming.amount, deadline: upcoming.deadline });
    }
  }

  const changed =
    next.codPaused !== standing.codPaused ||
    !sameInstant(next.payInOverdueSince, standing.payInOverdueSince) ||
    Math.abs(next.payInOverdueAmount - standing.payInOverdueAmount) > 0.004 ||
    !sameInstant(next.payInEscalatedAt, standing.payInEscalatedAt) ||
    !sameInstant(next.payInReviewAt, standing.payInReviewAt) ||
    next.payInPauseWaived !== standing.payInPauseWaived;
  return { standing: next, steps, changed };
}

// ─── Who gets cash-on-delivery jobs ────────────────────────────────────────

/**
 * Can this partner be offered a new job? Active ("Taking new jobs") and verified, and for cash-on-delivery
 * jobs, not paused for a late pay-in. Prepaid jobs ignore the late pause.
 */
export function canOfferJob(partner: { status: string; verificationStatus: string; codPaused?: boolean | null }, job: { cod: boolean }) {
  if (partner.status !== "active" || partner.verificationStatus !== "verified") return false;
  return job.cod ? !partner.codPaused : true;
}

/** Prisma where-fragment for partner lists: skip partners paused for a late pay-in when the job is cash-on-delivery. */
export function payWhenItArrivesWhere(cod: boolean): { codPaused?: false } {
  return cod ? { codPaused: false } : {};
}

// ─── Words ────────────────────────────────────────────────────────────────────

export const nairaWords = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today 6pm", "yesterday 6pm", "Friday 6pm", "3 Oct 6pm" (Lagos time). */
export function lagosWhenWords(at: Date, now: Date, t?: Translate) {
  const lagos = new Date(at.getTime() + LAGOS_OFFSET_MS);
  const dayOf = (date: Date) => Math.floor((date.getTime() + LAGOS_OFFSET_MS) / DAY_MS);
  const diff = dayOf(now) - dayOf(at);
  const minutes = lagos.getUTCMinutes();
  const time = minutes ? `${hourWords(lagos.getUTCHours()).replace(/(am|pm)$/, `:${String(minutes).padStart(2, "0")}$1`)}` : hourWords(lagos.getUTCHours());
  if (t) {
    const day =
      diff === 0 ? t.dynamic("kit.today", "today")
      : diff === 1 ? t.dynamic("kit.yesterday", "yesterday")
      : diff > 1 && diff < 7 ? t.dynamic(`payinWords.weekday.${lagos.getUTCDay()}`, WEEKDAYS[lagos.getUTCDay()])
      : `${lagos.getUTCDate()} ${t.dynamic(`payinWords.month.${lagos.getUTCMonth()}`, MONTHS[lagos.getUTCMonth()])}`;
    return t.dynamic("payinWords.dayTime", "{day} {time}", { day, time });
  }
  const day = diff === 0 ? "today" : diff === 1 ? "yesterday" : diff > 1 && diff < 7 ? WEEKDAYS[lagos.getUTCDay()] : `${lagos.getUTCDate()} ${MONTHS[lagos.getUTCMonth()]}`;
  return `${day} ${time}`;
}

export interface PayInAccountWords {
  accountNumber: string;
  bankName: string;
}

const accountLine = (account: PayInAccountWords | null) =>
  account ? `Pay into your account: ${account.accountNumber} ${account.bankName}.` : "Pay in from the Cash page in the Shopinbos Partners app.";

/** The calm card on Today and Money: "₦X overdue since yesterday 6pm. You're paused from … until you pay in." */
export function overdueCardWords(input: { amount: number; since: Date; paused: boolean; now: Date }, t?: Translate) {
  if (t) {
    return {
      title: t.dynamic("payinWords.overdueTitle", "{amount} overdue since {when}.", { amount: nairaWords(input.amount), when: lagosWhenWords(input.since, input.now, t) }),
      body: input.paused
        ? t.dynamic("payinWords.paused", "You're paused from cash-on-delivery jobs until you pay in.")
        : t.dynamic("payinWords.notPaused", "Please pay it in now. You still get all jobs for now."),
    };
  }
  const title = `${nairaWords(input.amount)} overdue since ${lagosWhenWords(input.since, input.now)}.`;
  const body = input.paused
    ? "You're paused from cash-on-delivery jobs until you pay in."
    : "Please pay it in now. You still get all jobs for now.";
  return { title, body };
}

/** Partner messages (app, WhatsApp/SMS, email). Plain words, the amount, and their own account. */
export function payInMessage(kind: "reminder" | "overdue" | "escalated" | "cleared", input: { amount: number; deadline: Date; account: PayInAccountWords | null; config: PayInConfig; now: Date }) {
  const amount = nairaWords(input.amount);
  if (kind === "reminder") {
    const dayOf = (date: Date) => Math.floor((date.getTime() + LAGOS_OFFSET_MS) / DAY_MS);
    const when = `${hourWords(input.config.cutoffHour)}${dayOf(input.deadline) === dayOf(input.now) ? " today" : " tonight"}`;
    return {
      title: `Pay in ${amount} by ${hourWords(input.config.cutoffHour)}`,
      body: `Cash your riders collected from customers is due by ${when}. ${accountLine(input.account)}`,
    };
  }
  if (kind === "cleared") {
    return { title: "Thanks, you're back to getting all jobs.", body: "Your cash is paid in. Shops can book you for cash-on-delivery jobs again." };
  }
  const body = `You have ${amount} from customers to pay in. Until you pay, you won't get new cash-on-delivery jobs. ${accountLine(input.account)}`;
  return kind === "escalated"
    ? { title: `Still to pay in: ${amount}`, body: `It was due ${lagosWhenWords(input.deadline, input.now)}. ${body}` }
    : { title: `Pay in ${amount} now`, body };
}

/** How the team sees a late partner: "late", "high" after 24 hours, "review" after 72 hours. */
export function lateLevel(standing: { payInEscalatedAt: Date | null; payInReviewAt: Date | null }) {
  return standing.payInReviewAt ? "review" : standing.payInEscalatedAt ? "high" : "late";
}
