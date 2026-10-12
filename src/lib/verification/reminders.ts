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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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

export function reminderEmail(input: ReminderEmailInput): { subject: string; html: string } {
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
  const cac = input.cacEnabled
    ? `<p style="margin:0 0 16px">Have your RC or BN number? Verify your registration instantly with CAC, so you don't need to upload the certificate.</p>`
    : "";
  const list = input.missing.length
    ? `<p style="margin:0 0 8px;font-weight:700">Still needed:</p><ul style="margin:0 0 16px;padding-left:20px">${input.missing.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
    : "";
  const html = `<div style="font-family:'Space Grotesk',Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#0E2A38;background:#FAF7F1">
<p style="margin:0 0 20px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#2E7E78">Shopinbos</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">Hi ${escapeHtml(input.firstName)},</h1>
<p style="margin:0 0 16px;line-height:1.55">${escapeHtml(lead)}</p>
${list}${cac}
<p style="margin:24px 0"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#0E2A38;color:#F4F1EA;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:999px">Finish verification</a></p>
<p style="margin:0;font-size:13px;color:#6E6E68">PDF, JPG, PNG or WebP, up to 10 MB each. Questions? Reply to this email.</p>
</div>`;
  return { subject, html };
}
