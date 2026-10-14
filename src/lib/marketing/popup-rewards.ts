// Sign-up rewards for pop-ups and sign-up pages: the pure rules (no server imports), shared by the issuing
// code in popup-rewards.server.ts, the checkout and tests.
//
// A reward is one of:
// - a shared code (the seller's existing discount, or one made when the form is saved): everyone gets the same code;
// - a unique code per person: made at sign-up, one use, tied to the email that signed up. One per email per form.

import type { FormReward } from "./forms.ts";

// No 0/O, 1/I/L: codes get read out over WhatsApp and typed on phones.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "WELCOME-7FQ2KD" from random bytes (the server passes crypto bytes). */
export function formRewardCode(prefix: string, bytes: ArrayLike<number>, length = 6): string {
  const clean = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "WELCOME";
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[(bytes[i % bytes.length]! + Math.floor(i / bytes.length) * 7) % CODE_ALPHABET.length];
  return `${clean}-${out}`;
}

/** What goes in Discount.config of a unique sign-up code, so it can be found again and tied to the person. */
export function uniqueCodeMarker(formId: string, email: string) {
  return { form: { formId, email: email.trim().toLowerCase() } };
}

/** The `form` marker on a discount's config, if it was made by a sign-up form. */
export function readFormMarker(config: unknown): { formId: string; email: string | null; shared: boolean } | null {
  const c = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  const f = c.form && typeof c.form === "object" && !Array.isArray(c.form) ? (c.form as Record<string, unknown>) : null;
  if (!f || typeof f.formId !== "string") return null;
  return { formId: f.formId, email: typeof f.email === "string" && f.email ? f.email.toLowerCase() : null, shared: f.shared === true };
}

/**
 * A code made for one person's sign-up only works with their email at checkout.
 * Returns the message to show, or null when the email is fine (or the code isn't tied to anyone).
 */
export function lockedEmailError(config: unknown, buyerEmail: string | null | undefined): string | null {
  const marker = readFormMarker(config);
  if (!marker?.email) return null;
  const email = buyerEmail?.trim().toLowerCase();
  if (!email) return "Enter the email you signed up with to use this code.";
  return email === marker.email ? null : "This code belongs to a different email. Use the email you signed up with.";
}

/** When a new code should end: N days from now, or never (0 days). */
export function rewardExpiry(days: number, now = Date.now()): Date | null {
  return days > 0 ? new Date(now + days * 86_400_000) : null;
}

export interface IssuedCodeLike {
  code: string;
  status: string;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
}

export type IssueDecision =
  | { action: "none" }
  | { action: "shared"; discountId: string }
  | { action: "reuse"; code: string }
  | { action: "spent" }
  | { action: "create" };

/**
 * What the server does when someone signs up:
 * shared/existing codes are handed out to everyone; a unique code is made once per email per form, and a second
 * sign-up with the same email gets the same code back (or nothing new, if it was used or has ended).
 */
export function decideIssue(reward: FormReward | null, earlier: IssuedCodeLike | null, now = new Date()): IssueDecision {
  if (!reward) return { action: "none" };
  if (reward.source === "existing" || !reward.unique) return reward.discountId ? { action: "shared", discountId: reward.discountId } : { action: "none" };
  if (!earlier) return { action: "create" };
  const spent =
    earlier.status !== "active" ||
    (earlier.expiresAt !== null && now > earlier.expiresAt) ||
    (Boolean(earlier.maxUses) && earlier.usedCount >= (earlier.maxUses ?? 0));
  return spent ? { action: "spent" } : { action: "reuse", code: earlier.code };
}

/** The Discount fields for one person's unique code (same shape /home/discounts saves). */
export function uniqueDiscountInput(reward: FormReward, formName: string, code: string, now = Date.now()) {
  const expiresAt = rewardExpiry(reward.days, now);
  return {
    name: `Sign-up code: ${formName}`.slice(0, 120),
    code,
    type: reward.type,
    value: reward.value,
    minOrder: reward.minOrder || 0,
    maxUses: 1,
    startsAt: null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    status: "active" as const,
    config: { automatic: false, oncePerCustomer: true },
  };
}

/** A shared code for a "make a new one here" reward: the seller's code, else WELCOME10 / WELCOME2000. */
export function sharedCodeFor(reward: FormReward): string {
  if (reward.code) return reward.code;
  return `${reward.prefix || "WELCOME"}${Math.round(reward.value)}`.slice(0, 40);
}
