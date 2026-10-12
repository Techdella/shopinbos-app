import { html } from "../email/shell.ts";

// Reminders for suppliers and delivery partners who are in their portal but haven't finished verification
// (usually because they chose "Continue without documents"). Pure, so it is unit-tested in
// tests/verification-reminders.test.mjs; the sending lives in reminders.server.ts.

/** Days after someone starts without documents that each reminder goes out. Three at most. */
export const REMINDER_DAYS = [1, 3, 7] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which reminder (0, 1, 2) is due now, or null. `sent` is how many already went out. Never sends two in one
 * run, and never sends one sooner than a day after the previous.
 */
export function dueReminder(startedAt: string | null | undefined, sent: string[], now = Date.now()): number | null {
  const start = Date.parse(String(startedAt ?? ""));
  if (!Number.isFinite(start)) return null;
  const index = sent.length;
  if (index >= REMINDER_DAYS.length) return null;
  if (now < start + REMINDER_DAYS[index] * DAY_MS) return null;
  const last = sent.length ? Date.parse(sent[sent.length - 1]) : NaN;
  if (Number.isFinite(last) && now - last < DAY_MS) return null;
  return index;
}

/** When the clock starts: "add documents later", else the last onboarding save. */
export function reminderStart(state: unknown): string | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const s = state as Record<string, unknown>;
  if (typeof s.docsLaterAt === "string") return s.docsLaterAt;
  if (s.completed === true && typeof s.updatedAt === "string") return s.updatedAt;
  return null;
}

export function sentReminders(state: unknown): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const list = (state as Record<string, unknown>).docReminders;
  return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string") : [];
}

export interface ReminderEmailInput {
  index: number;
  role: "supplier" | "logistics_partner";
  firstName: string;
  businessName: string;
  missing: string[];
  link: string;
  cacEnabled: boolean;
}

export function reminderEmail(input: ReminderEmailInput): { subject: string; heading: string; preheader: string; html: string; bodyHtml: string } {
  const who = input.role === "supplier" ? "sellers" : "sellers who need deliveries";
  const subject =
    input.index === 0
      ? `${input.businessName}: finish verification to start getting orders`
      : input.index === 1
        ? `${input.firstName}, ${who} can't see ${input.businessName} yet`
        : `Last reminder: verify ${input.businessName} on Shopinbos`;
  const lead =
    input.index === 0
      ? `You set up ${input.businessName} on Shopinbos. One step left: verify your business so ${who} can find you, order and ask for quotes.`
      : input.index === 1
        ? `${input.businessName} is set up, but stays hidden from ${who} until it's verified. It takes a few minutes once your documents are to hand.`
        : `This is our last reminder. Your account stays, and you can verify whenever you're ready.`;
  const cac = input.cacEnabled ? html.p("Have your RC or BN number? Verify your registration instantly with CAC, so you don't need to upload the certificate.") : "";
  const list = input.missing.length ? `<p class="sib-ink" style="margin:0 0 8px;font-weight:700">Still needed:</p>${html.list(input.missing)}` : "";
  // The card body for the shared shell (sendPlatformEmail adds the logo, footer and unsubscribe links).
  const body = `${html.p(lead)}${list}${cac}${html.button("Finish verification", input.link)}${html.small("PDF, JPG, PNG or WebP, up to 10 MB each. Questions? Reply to this email.")}`;
  return { subject, heading: `Hi ${input.firstName},`, preheader: lead, html: `${html.h1(`Hi ${input.firstName},`)}${body}`, bodyHtml: body };
}
