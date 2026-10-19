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
