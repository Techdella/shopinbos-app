// Pilot testing (Admin › Leads › Pilot testing): who gets invited, the reply form, the deadline, picking testers
// and the messages each step sends. Pure and browser-safe; unit-tested (tests/pilot.test.mjs). Signed reply links
// are in ./tokens.ts.
import { z } from "zod";
import { LEAD_ROLES, type LeadRole } from "../lead-growth/pure.ts";

export const PILOT_ROLES = LEAD_ROLES;
export type PilotRole = LeadRole;

export const PILOT_ROLE_LABELS: Record<PilotRole, string> = { seller: "Sellers", supplier: "Suppliers", delivery: "Delivery partners" };
export const PILOT_ROLE_NAME: Record<PilotRole, string> = { seller: "seller", supplier: "supplier", delivery: "delivery partner" };

export const APPLICANT_STATUSES = ["invited", "applied", "selected", "waitlisted", "declined"] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export const APPLICANT_STATUS_LABELS: Record<ApplicantStatus, string> = {
  invited: "No reply yet",
  applied: "Replied",
  selected: "Selected",
  waitlisted: "Next wave",
  declined: "Can't take part",
};

export const TEXT_CHANNELS = ["sms", "whatsapp", "none"] as const;
export type TextChannel = (typeof TEXT_CHANNELS)[number];

export const DEVICES = ["android", "iphone", "computer"] as const;
export const DEVICE_LABELS: Record<(typeof DEVICES)[number], string> = { android: "Android phone", iphone: "iPhone", computer: "Laptop or desktop" };

export const AVAILABILITY = ["30min", "1h", "2h+"] as const;
export const AVAILABILITY_LABELS: Record<(typeof AVAILABILITY)[number], string> = {
  "30min": "About 30 minutes a week",
  "1h": "About 1 hour a week",
  "2h+": "2 hours or more a week",
};

/** How many testers to pick per role. */
export const PilotTargets = z.object({
  seller: z.number().int().min(0).max(1000).default(20),
  supplier: z.number().int().min(0).max(1000).default(12),
  delivery: z.number().int().min(0).max(1000).default(8),
});
export type PilotTargetsType = z.infer<typeof PilotTargets>;

export function readTargets(value: unknown): PilotTargetsType {
  const parsed = PilotTargets.safeParse(value && typeof value === "object" ? value : {});
  return parsed.success ? parsed.data : PilotTargets.parse({});
}

export const PilotProgramInput = z.object({
  name: z.string().trim().min(1, "Give the pilot a name.").max(120),
  closesAt: z.coerce.date({ message: "Pick the reply deadline." }),
  roles: z.array(z.enum(PILOT_ROLES)).min(1, "Invite at least one group.").max(3),
  targets: PilotTargets,
  includeNoConsent: z.boolean().default(false),
  textChannel: z.enum(TEXT_CHANNELS).default("sms"),
});
export type PilotProgramInputType = z.infer<typeof PilotProgramInput>;

const optional = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

/** The reply form on /pilot/<token>. */
export const PilotReply = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter an email address we can send your login to.").max(190),
  phone: optional(32),
  businessName: optional(160),
  city: z.string().trim().min(1, "Which city or state are you in?").max(120),
  businessType: optional(300),
  devices: z.array(z.enum(DEVICES)).min(1, "Tick at least one device you'll test on.").max(3),
  availability: z.enum(AVAILABILITY, { message: "Pick how much time you can give." }),
  note: optional(1000),
});
export type PilotReplyType = z.infer<typeof PilotReply>;

/** True once replies are no longer taken: closed by hand, or past the deadline. */
export function pilotIsClosed(program: { status: string; closesAt: Date }, now = new Date()) {
  return program.status === "closed" || now.getTime() >= program.closesAt.getTime();
}

/** "Friday 6 November, 11:59 pm" in Lagos time. */
export function deadlineText(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).format(date);
}

/** Leads in these statuses may still get a decision; "selected" and "waitlisted" can be swapped until notified. */
export function canDecide(status: string) {
  return status === "applied" || status === "selected" || status === "waitlisted";
}

/**
 * Fills the open places per role with the earliest replies: who answered first gets in first, up to the target,
 * counting anyone already selected. Returns the ids to select. Pure so the rule is tested.
 */
export function autoPick(applicants: Array<{ id: string; role: string; status: string; appliedAt: Date | null }>, targets: PilotTargetsType) {
  const picked: string[] = [];
  for (const role of PILOT_ROLES) {
    const mine = applicants.filter((a) => a.role === role);
    let open = targets[role] - mine.filter((a) => a.status === "selected").length;
    const waiting = mine.filter((a) => a.status === "applied").sort((a, b) => (a.appliedAt?.getTime() ?? Infinity) - (b.appliedAt?.getTime() ?? Infinity));
    for (const applicant of waiting) {
      if (open <= 0) break;
      picked.push(applicant.id);
      open -= 1;
    }
  }
  return picked;
}

// ─── Messages ───────────────────────────────────────────────────────────────────────────────────────────────────

const WHAT_YOU_TEST: Record<PilotRole, string> = {
  seller: "build your store with Rex, add products from suppliers, take an order and book a delivery",
  supplier: "list your products, answer quote requests from sellers and manage orders",
  delivery: "set your areas and prices, accept delivery jobs and update their status",
};

/** The invitation. Email gets the link as a button; SMS and WhatsApp carry it in the text. */
export function inviteMessage(input: { role: PilotRole; firstName: string; closesAt: Date; link: string; channel: "email" | "sms" | "whatsapp" }) {
  const hi = `Hi ${input.firstName || "there"}`;
  const deadline = deadlineText(input.closesAt);
  if (input.channel === "sms") {
    return { subject: null, body: `${hi}, Shopinbos here. You joined our ${PILOT_ROLE_NAME[input.role]} waitlist: want to test the app before launch? Reply by ${deadline}: ${input.link}` };
  }
  const body = [
    `${hi},`,
    `Thanks for joining the Shopinbos waitlist as a ${PILOT_ROLE_NAME[input.role]}. Before we open to everyone, we're picking a small group to test the app for two weeks and tell us what works and what doesn't.`,
    `As a tester you'd ${WHAT_YOU_TEST[input.role]}, then share quick feedback with our team. You get early access and a say in how Shopinbos works.`,
    `Want in? Fill the short form (2 minutes) by ${deadline}. We pick testers from the people who reply in time, and everyone else goes to the next wave.`,
  ].join("\n\n");
  return { subject: "Test Shopinbos before launch?", body: input.channel === "whatsapp" ? `${body}\n\nReply here: ${input.link}` : body, ctaLabel: "Join the pilot" };
}

/** The one reminder, for people who haven't replied yet. */
export function reminderMessage(input: { firstName: string; closesAt: Date; link: string; channel: "email" | "sms" | "whatsapp" }) {
  const hi = `Hi ${input.firstName || "there"}`;
  const deadline = deadlineText(input.closesAt);
  if (input.channel === "sms") return { subject: null, body: `${hi}, last call to test Shopinbos before launch. Reply by ${deadline}: ${input.link}` };
  const body = [`${hi},`, `A quick reminder: replies for the Shopinbos pilot close ${deadline}. It takes 2 minutes, and we can only pick testers from people who reply.`].join("\n\n");
  return { subject: "Last call: test Shopinbos before launch", body: input.channel === "whatsapp" ? `${body}\n\nReply here: ${input.link}` : body, ctaLabel: "Reply now" };
}

/** What a selected tester does, by role. */
export const PILOT_CHECKLIST: Record<PilotRole, string[]> = {
  seller: [
    "Sign up (or sign in) with this email address",
    "Build your store with Rex and publish it",
    "Add at least 3 products, including one from a supplier in the marketplace",
    "Place a test order on your own store",
    "Book a delivery for that order",
    "Send us your feedback: what was easy, what was confusing, anything that broke",
  ],
  supplier: [
    "Sign up (or sign in) with this email address",
    "Complete your supplier profile and payout details",
    "List at least 5 products with photos and prices",
    "Answer a quote request and handle an order from a seller",
    "Send us your feedback: what was easy, what was confusing, anything that broke",
  ],
  delivery: [
    "Sign up (or sign in) with this email address",
    "Set your delivery areas and prices",
    "Accept a delivery job and move it through pickup and delivery",
    "Check your earnings and payout details",
    "Send us your feedback: what was easy, what was confusing, anything that broke",
  ],
};

/** "You're in": where to start, and the checklist. */
export function selectedMessage(input: { role: PilotRole; firstName: string; hasAccount: boolean }) {
  return {
    subject: "You're in: welcome to the Shopinbos pilot",
    intro: `Hi ${input.firstName || "there"}, thanks for replying. You're one of the ${PILOT_ROLE_NAME[input.role]}s testing Shopinbos before launch. The pilot runs for two weeks from today.`,
    checklist: PILOT_CHECKLIST[input.role],
    after: "Use the email address this message came to, so we can match your account to the pilot. When something breaks or confuses you, tell us on WhatsApp straight away: a screenshot is perfect.",
    ctaLabel: input.hasAccount ? "Sign in to Shopinbos" : "Create your account",
  };
}

/** For people who replied but weren't picked this time. */
export function waitlistedMessage(input: { firstName: string }) {
  return {
    subject: "You're on the list for the next wave",
    body: [
      `Hi ${input.firstName || "there"},`,
      "Thank you for replying to the Shopinbos pilot. So many people said yes that we couldn't take everyone in this first group.",
      "You're first in line for the next wave, and we'll write to this email address as soon as it opens. Nothing to do until then.",
    ].join("\n\n"),
  };
}
