import { html } from "../email/shell.ts";
import type { SetupChecklist, SetupStep } from "./checklist.ts";

// Setup nudges for new sellers ("lifecycle" email, the "Onboarding and setup nudges" preference): while their shop's
// Start here checklist (./checklist.ts) isn't finished, a few emails in the first two weeks, each about the next step.
// Pure, so it is unit-tested in tests/lifecycle-emails.test.mjs; the sending lives in lifecycle.server.ts and runs
// hourly from /api/cron/lifecycle.

/** Days after the shop was made that each nudge goes out. Four at most. */
export const LIFECYCLE_DAYS = [1, 3, 7, 14] as const;
/** Shops older than this get no nudges (they've had all four, or joined before nudges existed). */
export const LIFECYCLE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which nudge (0-3) is due now, or null. `sent` is what's recorded so far (one entry per nudge, sent or skipped).
 * Only the latest nudge whose day has come is sent (a shop that's 10 days old gets the day-7 one, not a catch-up
 * run of all three); never two in one run, never one sooner than a day after the previous, none past the window.
 */
export function dueLifecycleEmail(createdAt: Date | string, sent: string[], now = Date.now()): number | null {
  const start = new Date(createdAt).getTime();
  if (!Number.isFinite(start) || now - start > LIFECYCLE_WINDOW_DAYS * DAY_MS) return null;
  let due = -1;
  LIFECYCLE_DAYS.forEach((day, index) => {
    if (now >= start + day * DAY_MS) due = index;
  });
  if (due < sent.length) return null;
  const last = [...sent].reverse().map((t) => Date.parse(t)).find(Number.isFinite);
  if (last !== undefined && now - last < DAY_MS) return null;
  return due;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Nudges already sent, kept in Store.brandSettings.setup.lifecycleEmails. */
export function sentLifecycleEmails(brandSettings: unknown): string[] {
  const list = record(record(brandSettings).setup).lifecycleEmails;
  return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string") : [];
}

/** brandSettings with nudge `index` recorded as sent and any earlier ones it jumped over as "skipped". */
export function withLifecycleEmailSent(brandSettings: unknown, at: Date, index: number): Record<string, unknown> {
  const settings = record(brandSettings);
  const setup = record(settings.setup);
  const list = sentLifecycleEmails(brandSettings);
  while (list.length < index) list.push("skipped");
  return { ...settings, setup: { ...setup, lifecycleEmails: [...list, at.toISOString()] } };
}

/** Whether a seller should get nudges at all: setup isn't finished and they didn't say "I'm done here". */
export function wantsSetupNudges(checklist: SetupChecklist): boolean {
  return checklist.showStart && Boolean(checklist.next);
}

/** Where a step's button goes: its own page, or Start here for the steps done in place there. */
export function stepLink(step: SetupStep, base: string): string {
  const path = step.action.kind === "link" ? step.action.href : "/home/start";
  return `${base}${path}`;
}

export interface LifecycleEmailInput {
  index: number;
  firstName: string;
  storeName: string;
  checklist: SetupChecklist;
  base: string;
}

/** The nudge: progress, the next step with its button, and the other steps left. */
export function lifecycleEmail(input: LifecycleEmailInput): { subject: string; heading: string; preheader: string; bodyHtml: string } {
  const { checklist, storeName, firstName } = input;
  const next = checklist.next!;
  const left = checklist.steps.filter((step) => !step.optional && !step.done && !step.skipped && step.key !== next.key);
  const subject =
    input.index === 0
      ? `${storeName}: your next step is "${next.title.toLowerCase()}"`
      : input.index === 1
        ? `${firstName}, ${storeName} is ${checklist.percent}% ready`
        : input.index === 2
          ? `A few minutes to finish ${storeName}`
          : `Last nudge: ${storeName} is almost ready to sell`;
  const lead =
    input.index === 0
      ? `Welcome to Shopinbos. ${storeName} is set up; here's the next thing that gets you closer to your first order.`
      : input.index === 1
        ? `You've done ${checklist.done} of ${checklist.total} setup steps. Keep going: each one makes it easier for customers to buy.`
        : input.index === 2
          ? `${storeName} is ${checklist.percent}% ready. The steps left take a few minutes each, and Peggy and Rex can do most of them with you.`
          : `This is our last setup reminder. Your shop stays as it is, and Start here keeps your progress whenever you're ready.`;
  const helper = next.helper ? html.small(`Short on time? Ask ${next.helper.who === "peggy" ? "Peggy" : "Rex"} in the app to do it with you.`) : "";
  const others = left.length ? `<p class="sib-ink" style="margin:0 0 8px;font-weight:700">Also left:</p>${html.list(left.slice(0, 4).map((step) => step.title))}` : "";
  const body = [
    html.p(lead),
    html.quote(`${html.raw(`<strong>${escape(next.title)}</strong>`)}${html.small(next.hint)}`),
    html.button(next.action.label === "View" ? "Open Start here" : next.action.label, stepLink(next, input.base)),
    helper,
    others,
    html.small("You get these while your shop's setup isn't finished. Turn them off any time from the link below."),
  ].join("");
  return { subject, heading: `Hi ${firstName},`, preheader: lead, bodyHtml: body };
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Paused setup ─────────────────────────────────────────────────────────────
// Sellers who started building (at least one step past creating the shop) and then stopped coming back: a "pick up
// where you left off" nudge 2 and 5 days into the quiet spell, before the 7-day winback journey takes over. Keyed to
// the quiet spell (their last active day), so coming back and pausing again starts over, up to RESUME_MAX in all.

/** Days of quiet before each paused-setup nudge. */
export const RESUME_DAYS = [2, 5] as const;
/** Quiet this long and the winback journey (src/lib/member-messaging/journeys.ts) speaks instead. */
export const RESUME_QUIET_MAX_DAYS = 7;
/** Paused-setup nudges a shop can get in all, across every quiet spell. */
export const RESUME_MAX = 4;
/** Shops older than this get no paused-setup nudges. */
export const RESUME_WINDOW_DAYS = 90;

export interface ResumeNudge {
  period: string;
  at: string;
}

/** "d2" or "d5" while the seller has been quiet that long (and under a week), else null. */
export function resumeStage(lastActive: Date, now = Date.now()): "d2" | "d5" | null {
  const quiet = (now - lastActive.getTime()) / DAY_MS;
  if (quiet >= RESUME_DAYS[1] && quiet < RESUME_QUIET_MAX_DAYS) return "d5";
  if (quiet >= RESUME_DAYS[0] && quiet < RESUME_DAYS[1]) return "d2";
  return null;
}

/** "2026-10-25:d2": the quiet spell (last active day) and the step, so each goes once per spell. */
export function resumePeriod(lastActive: Date, stage: string) {
  return `${lastActive.toISOString().slice(0, 10)}:${stage}`;
}

/** Paused-setup nudges already sent, kept in Store.brandSettings.setup.resumeNudges. */
export function sentResumeNudges(brandSettings: unknown): ResumeNudge[] {
  const list = record(record(brandSettings).setup).resumeNudges;
  if (!Array.isArray(list)) return [];
  return list
    .map(record)
    .filter((row): row is Record<string, unknown> & ResumeNudge => typeof row.period === "string" && typeof row.at === "string");
}

/** brandSettings with a paused-setup nudge recorded. */
export function withResumeNudgeSent(brandSettings: unknown, at: Date, period: string): Record<string, unknown> {
  const settings = record(brandSettings);
  const setup = record(settings.setup);
  return { ...settings, setup: { ...setup, resumeNudges: [...sentResumeNudges(brandSettings), { period, at: at.toISOString() }] } };
}

/** Did something past creating the shop: picked a look, added products, turned on payments... */
export function startedBuilding(checklist: SetupChecklist): boolean {
  return checklist.steps.some((step) => step.key !== "store" && step.done);
}

/** Whether a paused-setup nudge for this spell and step should go: setup unfinished, started, not sent, under the cap. */
export function wantsResumeNudge(checklist: SetupChecklist, sent: ResumeNudge[], period: string): boolean {
  return wantsSetupNudges(checklist) && startedBuilding(checklist) && sent.length < RESUME_MAX && !sent.some((row) => row.period === period);
}

/** The nudge: how far they got, what they've done, and the next step with its button. */
export function resumeEmail(input: { stage: "d2" | "d5"; firstName: string; storeName: string; checklist: SetupChecklist; base: string }): { subject: string; heading: string; preheader: string; bodyHtml: string; title: string; description: string } {
  const { checklist, storeName } = input;
  const next = checklist.next!;
  const doneSteps = checklist.steps.filter((step) => step.done && step.key !== "store");
  const subject =
    input.stage === "d2"
      ? `Pick up where you left off: ${storeName} is ${checklist.percent}% ready`
      : `${storeName} is waiting for you, ${input.firstName}`;
  const lead =
    input.stage === "d2"
      ? `You made a great start on ${storeName}. Everything you did is saved, so you can carry on from the next step.`
      : `${storeName} is ${checklist.percent}% of the way to taking orders. One more step today gets you closer to your first sale.`;
  const helper = next.helper ? html.small(`Busy? Ask ${next.helper.who === "peggy" ? "Peggy" : "Rex"} in the app and they'll do it with you.`) : "";
  const done = doneSteps.length ? `<p class="sib-ink" style="margin:0 0 8px;font-weight:700">Already done:</p>${html.list(doneSteps.slice(0, 5).map((step) => step.title))}` : "";
  const body = [
    html.p(lead),
    html.quote(`${html.raw(`<strong>Next: ${escape(next.title)}</strong>`)}${html.small(next.hint)}`),
    html.button(next.action.label === "View" ? "Carry on setting up" : next.action.label, stepLink(next, input.base)),
    helper,
    done,
    html.small("You get these while your shop's setup isn't finished. Turn them off any time from the link below."),
  ].join("");
  return {
    subject,
    heading: `Hi ${input.firstName},`,
    preheader: lead,
    bodyHtml: body,
    title: `${storeName} is ${checklist.percent}% ready`,
    description: `Pick up where you left off: ${next.title.toLowerCase()}.`,
  };
}
