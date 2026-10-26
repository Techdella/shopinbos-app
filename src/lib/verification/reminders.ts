import { escapeHtml, html } from "../email/shell.ts";

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

// ─── The "verify your account" sequence (email + WhatsApp) ────────────────────
// Replaces the reminders above for everyone not verified yet, including partners who finished the old series: three
// nudges, the first now, then 3 and 7 days after it. The first tells a partner already given a wallet account number
// that the wallet switches on once they're verified. Every one points to Peggy, our AI support, on a free call, with
// a picture of where she is on the dashboard.

export const NUDGE_DAYS = [0, 3, 7] as const;

export function sentNudges(state: unknown): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const list = (state as Record<string, unknown>).verifyNudges;
  return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string") : [];
}

/** Which nudge (0, 1, 2) is due now, or null: the first straight away, the others counted from the first. */
export function dueNudge(sent: string[], now = Date.now()): number | null {
  const index = sent.length;
  if (index >= NUDGE_DAYS.length) return null;
  if (index === 0) return 0;
  const first = Date.parse(sent[0]);
  const last = Date.parse(sent[sent.length - 1]);
  if (!Number.isFinite(first) || now < first + NUDGE_DAYS[index] * DAY_MS) return null;
  if (Number.isFinite(last) && now - last < DAY_MS) return null;
  return index;
}

export interface NudgeInput extends ReminderEmailInput {
  /** Their wallet account number, when they were already given one. */
  wallet: { number: string; bank: string } | null;
  /** The picture of where Call Peggy is on the dashboard. */
  peggyImage: string;
  dashboard: string;
}

const grouped = (number: string) => (number.length === 10 ? `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}` : number);

export function verifyNudgeEmail(input: NudgeInput): { subject: string; heading: string; preheader: string; bodyHtml: string } {
  const who = input.role === "supplier" ? "sellers" : "sellers who need deliveries";
  const subject =
    input.index === 0
      ? input.wallet
        ? `${input.businessName}: your Shopinbos Wallet switches on when you verify`
        : `${input.businessName}: finish verification to start getting orders`
      : input.index === 1
        ? `Need a hand verifying ${input.businessName}? Call Peggy, free`
        : `Last reminder: verify ${input.businessName} on Shopinbos`;
  const lead =
    input.index === 0
      ? input.wallet
        ? `We set up your Shopinbos Wallet. It switches on as soon as ${input.businessName} is verified: then you can top up, get paid into it and withdraw to your bank.`
        : `You set up ${input.businessName} on Shopinbos. One step left: verify your business so ${who} can find you and order.`
      : input.index === 1
        ? `${input.businessName} still isn't verified, so ${who} can't see you yet${input.wallet ? " and your wallet is waiting" : ""}. If anything is in the way, Peggy can talk you through it on a free call.`
        : `This is our last reminder. Your account stays, and you can verify whenever you're ready${input.wallet ? `; your wallet switches on the moment you do` : ""}.`;
  const wallet = input.wallet
    ? html.quote(
        `<p class="sib-muted" style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase">Your wallet account number</p>` +
          `<p class="sib-ink" style="margin:0;font-size:22px;font-weight:700;letter-spacing:0.06em">${escapeHtml(grouped(input.wallet.number))}</p>` +
          `<p class="sib-muted" style="margin:4px 0 0;font-size:13px">${escapeHtml(input.wallet.bank)} · switches on when you're verified</p>`,
      )
    : "";
  const list = input.missing.length ? `<p class="sib-ink" style="margin:0 0 8px;font-weight:700">Still needed:</p>${html.list(input.missing)}` : "";
  const cac = input.cacEnabled ? html.p("Have your RC or BN number? Verify your registration instantly with CAC, so you don't need to upload the certificate.") : "";
  const peggy =
    html.divider() +
    `<p class="sib-ink" style="margin:0 0 6px;font-size:17px;font-weight:700">Stuck? Call Peggy, free</p>` +
    html.p("Peggy is Shopinbos's AI support. She talks you through verification step by step on a free voice call. Open your dashboard and tap Call Peggy, or chat with her from Ask Peggy at the top of any page.") +
    `<a href="${escapeHtml(input.dashboard)}" style="display:block;margin:0 0 14px"><img src="${escapeHtml(input.peggyImage)}" width="520" alt="Your Shopinbos dashboard, with the Call Peggy button and Ask Peggy at the top" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid #E7E1D5;border-radius:14px" /></a>`;
  const bodyHtml = `${html.p(lead)}${wallet}${list}${cac}${html.button("Verify my business", input.link)}${peggy}${html.small("PDF, JPG, PNG or WebP, up to 10 MB each. Questions? Reply to this email.")}`;
  return { subject, heading: `Hi ${input.firstName},`, preheader: lead, bodyHtml };
}
