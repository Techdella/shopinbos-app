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
// Marketing ones keep to sending hours (Mon–Sat 08:00–20:00 Lagos) and at most 3 marketing emails a week per person.

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

const WHAT: Record<JourneyRole, { business: string; win: string; next: string }> = {
  seller: { business: "your shop", win: "your first paid order", next: "Ask this buyer for a review and a photo, then share it on your Status: happy customers sell for you." },
  supplier: { business: "your supplier account", win: "your first order from a shop", next: "Ship it fast and pack it well: shops reorder from suppliers they can count on, and fast acceptance moves you up the marketplace." },
  logistics_partner: { business: "your delivery business", win: "your first delivery", next: "Ask the shop for a review: 5-star partners show up first when shops book deliveries." },
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
  /** setup_help: the next step and how many are done. */
  nextStep?: { label: string; hint: string; href: string } | null;
  done?: number;
  total?: number;
  /** winback day 14: credits just given. */
  giftCredits?: number;
  /** credits_low: what's left. */
  creditsLeft?: number;
}

export function journeyMessage(key: JourneyKey, stage: string, role: JourneyRole, vars: JourneyVars): JourneyMessage {
  const paths = PATHS[role];
  const what = WHAT[role];
  const hi = `Hello ${vars.firstName} 👋🏾,`;
  if (key === "setup_help") {
    const step = vars.nextStep;
    const progress = vars.total ? `You've done ${vars.done ?? 0} of ${vars.total} steps.` : "";
    return {
      subject: stage === "d3" ? "Let's finish setting you up (Peggy can help)" : "Still setting up? Call Peggy, it's free",
      preheader: step ? `Next: ${step.label}. ${progress}` : progress,
      eyebrow: "From Peggy",
      heading: stage === "d3" ? "You're nearly ready" : "Let's get you over the line",
      paragraphs: [
        hi,
        `${progress} ${step ? `Next step: ${step.label}. ${step.hint}` : ""}`.trim(),
        "If anything's unclear, chat with me on your dashboard or tap Call Peggy for a free voice call. I'll walk you through it step by step, and I can save things like pickup points and prices for you.",
      ],
      cta: { label: step ? "Do the next step" : "Open my dashboard", path: step?.href ?? paths.setup },
      title: "Peggy can help you finish setting up",
      description: step ? `Next: ${step.label}. Chat or call Peggy on your dashboard.` : "Chat or call Peggy on your dashboard.",
    };
  }
  if (key === "winback") {
    if (stage === "d7") {
      return {
        subject: `${what.business.charAt(0).toUpperCase()}${what.business.slice(1)} misses you`,
        preheader: "Here's what's been happening on Shopinbos this week.",
        eyebrow: "From Rex & Peggy",
        heading: "It's been a week",
        paragraphs: [
          hi,
          role === "seller"
            ? "Shoppers are browsing right now. A new product, a Rex video on your Status or a quick discount is often all it takes to get orders moving again."
            : role === "supplier"
              ? "Shops are adding new products from the marketplace every day. Fresh stock, clear prices and quick replies to quote requests keep you in front of them."
              : "Shops are booking deliveries every day. Keep your coverage and prices up to date so the jobs near you come to you.",
          "Pop in for two minutes and see what's new.",
        ],
        cta: { label: "Open Shopinbos", path: paths.home },
        title: "We've missed you",
        description: "Pop in and see what's new on Shopinbos.",
      };
    }
    if (stage === "d14") {
      const gift = vars.giftCredits ?? 0;
      return {
        subject: gift ? `A gift to welcome you back: ${gift} AI credits` : "Come back and pick up where you left off",
        preheader: gift ? "They're already in your account. Make a Rex video or new product photos." : "Everything's where you left it.",
        eyebrow: "From Rex",
        heading: gift ? `${gift} free AI credits are waiting` : "Everything's where you left it",
        paragraphs: [
          hi,
          gift
            ? `We've added ${gift} AI credits to your account, no strings attached. That's enough for a few Rex videos, new product photos or fresh descriptions.`
            : "Your account is just as you left it.",
          role === "seller" ? "Try one Rex video of your best seller and post it on your Status today." : "Use them on fresh product photos or descriptions, or ask Peggy what to do next.",
        ],
        cta: { label: gift ? "Use my credits" : "Open Shopinbos", path: gift ? paths.credits : paths.home },
        title: gift ? `${gift} free AI credits added` : "Pick up where you left off",
        description: gift ? "A welcome-back gift. Use them on Rex videos, photos and more." : "Your account is just as you left it.",
      };
    }
    return {
      subject: "Can we help? A free call with Peggy",
      preheader: "If something got in the way, tell us. We'd love to help.",
      eyebrow: "From Peggy",
      heading: "We'd love to have you back",
      paragraphs: [
        hi,
        `It's been a month since we saw you. If something about ${what.business} got in the way, a missing feature, a question or just time, tell me and I'll help or pass it to the team.`,
        "You can chat with me or tap Call Peggy on your dashboard for a free call.",
      ],
      cta: { label: "Talk to Peggy", path: paths.home },
      title: "Can we help?",
      description: "Chat or call Peggy for free if something got in the way.",
    };
  }
  if (key === "first_win") {
    return {
      subject: `Congratulations on ${what.win}! 🎉`,
      preheader: "The first one is the hardest. Here's how to get the next ten.",
      eyebrow: "From Rex & Peggy",
      heading: `You did it: ${what.win}`,
      paragraphs: [hi, "The first one is always the hardest, and you've done it. Well done.", what.next],
      cta: { label: "See it", path: paths.jobs },
      title: `Congratulations on ${what.win}! 🎉`,
      description: what.next,
    };
  }
  const left = vars.creditsLeft ?? 0;
  return {
    subject: `You have ${left} AI credit${left === 1 ? "" : "s"} left`,
    preheader: "Top up so Rex can keep making videos, photos and descriptions for you.",
    eyebrow: "From Rex",
    heading: "Running low on AI credits",
    paragraphs: [
      hi,
      `You have ${left} AI credit${left === 1 ? "" : "s"} left. A Rex video is about 10, a new product photo about 10, and descriptions and captions about 1 each.`,
      "Top up with a credit pack, or use your wallet balance. A paid plan also refills credits every month. Inviting businesses with Refer & earn gets you free credits too.",
    ],
    cta: { label: "Top up credits", path: paths.credits },
    title: `${left} AI credits left`,
    description: "Top up so Rex can keep creating for you.",
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
export function journeyLook(key: JourneyKey, stage: string, message: JourneyMessage, firstName: string): JourneyLook {
  const bubbles = [`Hello ${escape(firstName)} 👋🏾`, ...message.paragraphs.slice(1).filter(Boolean).map(escape)];
  if (key === "first_win") return { look: "celebrate", persona: "rex", sticker: "OYA, CONGRATS! 🎉" };
  if (key === "winback" && stage === "d14") {
    const gift = /(\d+) free AI credits/.exec(message.heading)?.[1];
    return gift
      ? { look: "celebrate", persona: "rex", sticker: "WELCOME BACK 🎁", stats: [{ value: gift, label: "free AI credits" }, { value: `~${Math.floor(Number(gift) / 10)}`, label: "Rex videos" }, { value: `~${gift}`, label: "product descriptions" }] }
      : { look: "chat", persona: "rex", bubbles };
  }
  if (key === "setup_help") return { look: "chat", persona: "peggy", bubbles, reply: "Okay Peggy, I'm on it 🙏🏾" };
  if (key === "winback" && stage === "d7") return { look: "chat", persona: "peggy", bubbles, reply: "I dey come back now 😄" };
  if (key === "winback") return { look: "chat", persona: "peggy", bubbles };
  return { look: "chat", persona: "rex", bubbles };
}
