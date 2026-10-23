// Retention journeys for sellers, suppliers and delivery partners, pure: when each one is due and what it says.
// Unit-tested in tests/member-journeys.test.mjs; the sending is journeys.server.ts (hourly, with the tips job's
// MemberMessage log, so nobody gets the same step twice).
//
//  • setup_help: suppliers and delivery partners whose setup isn't finished, 3 and 10 days in (sellers have their
//    own setup nudges, src/lib/setup/lifecycle.ts): "Peggy can finish it with you", with chat and a free call.
//  • winback: 7, 14 and 30 days after someone last used the app. Day 14 comes with 50 free AI credits (once in 180
//    days). A new quiet spell after they come back starts again.
//  • first_win: their first paid order (seller), first accepted order (supplier) or first delivery (partner).
//  • credits_low: under 20 AI credits left while they're using them, once a month.
// Wording in each person's app language (shared/i18n/messages/mail, "j.*").
// Marketing ones keep to sending hours (Mon–Sat 08:00–20:00 Lagos) and at most 3 marketing emails a week per person.

import type { Locale } from "../../../shared/i18n/index.ts";
import { mailT, type MailKey } from "../../../shared/i18n/mail.ts";

export type JourneyRole = "seller" | "supplier" | "logistics_partner";
export type JourneyKey = "setup_help" | "winback" | "first_win" | "credits_low";

const DAY = 86_400_000;
const LAGOS_OFFSET_MS = 60 * 60_000;

/** Mon–Sat 08:00–20:00 Lagos. */
export function sendingHours(now: Date) {
  const local = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const weekday = local.getUTCDay();
  const hour = local.getUTCHours();
  return weekday !== 0 && hour >= 8 && hour < 20;
}

/** At most this many marketing emails (tips, journeys, announcements) per person in 7 days. */
export const WEEKLY_EMAIL_CAP = 3;

export function overEmailCap(sentLastWeek: number) {
  return sentLastWeek >= WEEKLY_EMAIL_CAP;
}

const days = (from: Date, now: Date) => (now.getTime() - from.getTime()) / DAY;

/** "d3" between 3 and 10 days after joining, "d10" between 10 and 20, else null. */
export function setupStage(createdAt: Date, now: Date): "d3" | "d10" | null {
  const age = days(createdAt, now);
  if (age >= 3 && age < 10) return "d3";
  if (age >= 10 && age < 20) return "d10";
  return null;
}

/** Quiet for 7–13 days: "d7"; 14–29: "d14"; 30–45: "d30"; longer than that: leave them be. */
export function winbackStage(lastActive: Date, now: Date): "d7" | "d14" | "d30" | null {
  const quiet = days(lastActive, now);
  if (quiet >= 7 && quiet < 14) return "d7";
  if (quiet >= 14 && quiet < 30) return "d14";
  if (quiet >= 30 && quiet < 46) return "d30";
  return null;
}

/** The winback step's log period: the quiet spell (their last active day) and the step, so a new spell starts over. */
export function winbackPeriod(lastActiveDay: string, stage: string) {
  return `${lastActiveDay}:${stage}`;
}

export const WINBACK_GIFT_CREDITS = 50;
export const WINBACK_GIFT_EVERY_DAYS = 180;
export const LOW_CREDITS = 20;

/** "2026-11": credits_low goes once a month. */
export function monthPeriod(now: Date) {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 7);
}

const PATHS: Record<JourneyRole, { home: string; credits: string; setup: string; jobs: string }> = {
  seller: { home: "/home", credits: "/home/credits", setup: "/home/start", jobs: "/home/orders" },
  supplier: { home: "/supplier/dashboard", credits: "/supplier/credits", setup: "/supplier/dashboard", jobs: "/supplier/orders" },
  logistics_partner: { home: "/logistics/dashboard", credits: "/logistics/credits", setup: "/logistics/dashboard", jobs: "/logistics/bookings" },
};

export interface JourneyMessage {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  cta: { label: string; path: string };
  /** The bell notification. */
  title: string;
  description: string;
}

export interface JourneyVars {
  firstName: string;
  /** setup_help: the next step (its id picks the translated wording) and how many are done. */
  nextStep?: { id?: string; label: string; hint: string; href: string } | null;
  done?: number;
  total?: number;
  /** winback day 14: credits just given. */
  giftCredits?: number;
  /** credits_low: what's left. */
  creditsLeft?: number;
}

/** A setup step in words ("adding your pickup address") and its hint, in the reader's language. */
export function setupStepText(role: JourneyRole, step: { id?: string; label: string; hint: string }, locale: Locale = "en") {
  const t = mailT(locale);
  const key = `step.${role}.${step.id}`;
  const hintKey = `step.hint.${role}.${step.id}`;
  const known = Boolean(step.id) && t.has(key);
  return { label: known ? t(key as MailKey) : step.label.toLowerCase(), hint: known && t.has(hintKey) ? t(hintKey as MailKey) : step.hint };
}

export function journeyMessage(key: JourneyKey, stage: string, role: JourneyRole, vars: JourneyVars, locale: Locale = "en"): JourneyMessage {
  const t = mailT(locale);
  const paths = PATHS[role];
  const hi = t("hello", { name: vars.firstName });
  if (key === "setup_help") {
    const step = vars.nextStep ? { ...setupStepText(role, vars.nextStep, locale), href: vars.nextStep.href } : null;
    const progress = vars.total ? t("j.setup.progress", { done: vars.done ?? 0, total: vars.total }) : "";
    return {
      subject: t(stage === "d3" ? "j.setup.subject.d3" : "j.setup.subject.d10"),
      preheader: step ? `${t("j.setup.preheaderNext", { step: step.label })} ${progress}`.trim() : progress,
      eyebrow: t("j.fromPeggy"),
      heading: t(stage === "d3" ? "j.setup.heading.d3" : "j.setup.heading.d10"),
      paragraphs: [hi, `${progress} ${step ? t("j.setup.next", { step: step.label, hint: step.hint }) : ""}`.trim(), t("j.setup.help")],
      cta: { label: t(step ? "j.setup.ctaNext" : "j.setup.ctaDashboard"), path: step?.href ?? paths.setup },
      title: t("j.setup.title"),
      description: step ? t("j.setup.descNext", { step: step.label }) : t("j.setup.desc"),
    };
  }
  if (key === "winback") {
    if (stage === "d7") {
      return {
        subject: t(`j.d7.subject.${role}`),
        preheader: t("j.d7.preheader"),
        eyebrow: t("j.fromBoth"),
        heading: t("j.d7.heading"),
        paragraphs: [hi, t(`j.d7.body.${role}`), t("j.d7.popIn")],
        cta: { label: t("j.openShopinbos"), path: paths.home },
        title: t("j.d7.title"),
        description: t("j.d7.desc"),
      };
    }
    if (stage === "d14") {
      const gift = vars.giftCredits ?? 0;
      return {
        subject: gift ? t("j.d14.subjectGift", { count: gift }) : t("j.d14.subject"),
        preheader: t(gift ? "j.d14.preheaderGift" : "j.d14.preheader"),
        eyebrow: t("j.fromRex"),
        heading: gift ? t("j.d14.headingGift", { count: gift }) : t("j.d14.heading"),
        paragraphs: [hi, gift ? t("j.d14.bodyGift", { count: gift }) : t("j.d14.body"), t(role === "seller" ? "j.d14.tip.seller" : "j.d14.tip.other")],
        cta: { label: t(gift ? "j.d14.ctaGift" : "j.openShopinbos"), path: gift ? paths.credits : paths.home },
        title: gift ? t("j.d14.titleGift", { count: gift }) : t("j.d14.title"),
        description: t(gift ? "j.d14.descGift" : "j.d14.body"),
      };
    }
    return {
      subject: t("j.d30.subject"),
      preheader: t("j.d30.preheader"),
      eyebrow: t("j.fromPeggy"),
      heading: t("j.d30.heading"),
      paragraphs: [hi, t("j.d30.body", { business: t(`j.business.${role}`) }), t("j.d30.call")],
      cta: { label: t("j.d30.cta"), path: paths.home },
      title: t("j.d30.title"),
      description: t("j.d30.desc"),
    };
  }
  if (key === "first_win") {
    const win = t(`j.win.${role}`);
    const next = t(`j.next.${role}`);
    return {
      subject: t("j.win.subject", { win }),
      preheader: t("j.win.preheader"),
      eyebrow: t("j.fromBoth"),
      heading: t("j.win.heading", { win }),
      paragraphs: [hi, t("j.win.body"), next],
      cta: { label: t("j.win.cta"), path: paths.jobs },
      title: t("j.win.subject", { win }),
      description: next,
    };
  }
  const left = vars.creditsLeft ?? 0;
  return {
    subject: t("j.low.subject", { count: left }),
    preheader: t("j.low.preheader"),
    eyebrow: t("j.fromRex"),
    heading: t("j.low.heading"),
    paragraphs: [hi, t("j.low.body", { count: left }), t("j.low.topup")],
    cta: { label: t("j.low.cta"), path: paths.credits },
    title: t("j.low.title", { count: left }),
    description: t("j.low.desc"),
  };
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The message's paragraphs as email HTML. */
export function journeyBodyHtml(message: JourneyMessage) {
  return message.paragraphs
    .filter(Boolean)
    .map((text) => `<p style="margin:0 0 14px">${escape(text)}</p>`)
    .join("");
}

/** The Refer & earn box at the end of the Monday weekly summary. */
export function referralSummaryHtml(input: { appUrl: string; joined: number; rewarded: number; waiting: number; earned: string | null }) {
  const base = input.appUrl.replace(/\/+$/, "");
  const status = input.joined
    ? `${input.joined} business${input.joined === 1 ? "" : "es"} joined with your invite${input.waiting ? `, ${input.waiting} on their way` : ""}${input.earned ? `. You've earned ${escape(input.earned)} so far` : ""}.`
    : "Invite a supplier and get 3 months free or 500 AI credits when they're set up. Shops and delivery partners count too.";
  return `<div style="margin:24px 0 0;padding:16px 18px;border-radius:14px;background:#EEF7F5;border:1px solid #D3ECE7">
<p style="margin:0 0 6px;font-weight:700;color:#0E2A38">Refer &amp; earn</p>
<p style="margin:0 0 10px;color:#0E2A38;font-size:14px;line-height:1.5">${status}</p>
<a href="${escape(`${base}/refer`)}" style="color:#0E2A38;font-weight:700;font-size:14px">Invite a business</a>
</div>`;
}

export interface JourneyLook {
  look: "chat" | "celebrate";
  persona: "rex" | "peggy";
  bubbles?: string[];
  reply?: string | null;
  sticker?: string | null;
  stats?: Array<{ value: string; label: string }>;
}

/**
 * How each journey looks (src/lib/email/looks.ts): nudges read like a WhatsApp chat with Peggy or Rex, wins and gifts
 * are a celebration. Chat bubbles are the message's paragraphs, the first one a warm hello.
 */
export function journeyLook(key: JourneyKey, stage: string, message: JourneyMessage, firstName: string, vars: Pick<JourneyVars, "giftCredits"> = {}, locale: Locale = "en"): JourneyLook {
  const t = mailT(locale);
  const bubbles = [escape(t("helloBubble", { name: firstName })), ...message.paragraphs.slice(1).filter(Boolean).map(escape)];
  if (key === "first_win") return { look: "celebrate", persona: "rex", sticker: t("j.win.sticker") };
  if (key === "winback" && stage === "d14") {
    const gift = vars.giftCredits ?? 0;
    return gift
      ? { look: "celebrate", persona: "rex", sticker: t("j.d14.sticker"), stats: [{ value: String(gift), label: t("j.d14.statCredits") }, { value: `~${Math.floor(gift / 10)}`, label: t("j.d14.statVideos") }, { value: `~${gift}`, label: t("j.d14.statDescriptions") }] }
      : { look: "chat", persona: "rex", bubbles };
  }
  if (key === "setup_help") return { look: "chat", persona: "peggy", bubbles, reply: t("j.setup.reply") };
  if (key === "winback" && stage === "d7") return { look: "chat", persona: "peggy", bubbles, reply: t("j.d7.reply") };
  if (key === "winback") return { look: "chat", persona: "peggy", bubbles };
  return { look: "chat", persona: "rex", bubbles };
}
