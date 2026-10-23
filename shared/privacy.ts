// Personal data in the admin portal, under the Nigeria Data Protection Act 2023 (NDPA): show what the job needs and no
// more. Contact details are masked until an admin gives a reason to see them (every look is logged, see
// src/lib/admin/data-access.server.ts); bank accounts only ever show their last 4 digits; a seller's customers are
// only counted, never listed. Pure, tested in tests/admin-sellers.test.mjs.

/** "adaeze.okafor@gmail.com" → "ad•••@gmail.com". */
export function maskEmail(email: string | null | undefined) {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, Math.min(2, local.length))}•••@${domain}`;
}

/** "+2348031234567" → "+234 ••• ••• 4567". */
export function maskPhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "•••";
  const country = phone.trim().startsWith("+") ? `+${digits.slice(0, digits.length > 10 ? digits.length - 10 : 0)}` : "";
  return `${country ? `${country} ` : ""}••• ••• ${digits.slice(-4)}`;
}

/** "0123456789" → "•••• 6789". */
export function maskAccount(account: string | null | undefined) {
  if (!account) return null;
  const digits = account.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

/** Why an admin may see someone's contact details: the lawful, specific purposes (NDPA s.24, purpose limitation). */
export const REVEAL_REASONS = [
  { key: "support", label: "Helping them with a support request" },
  { key: "verification", label: "Checking their identity or business" },
  { key: "payments", label: "Sorting out a payment or payout" },
  { key: "safety", label: "Fraud, safety or a complaint about them" },
  { key: "legal", label: "A legal or regulator's request" },
] as const;
export type RevealReason = (typeof REVEAL_REASONS)[number]["key"];

export function asRevealReason(value: unknown): RevealReason | null {
  return REVEAL_REASONS.some((reason) => reason.key === value) ? (value as RevealReason) : null;
}

/** A reveal shows the details for this long, on that admin's screen only; then they're masked again. */
export const REVEAL_MINUTES = 15;

/** Why a shop may be paused or restored by the team (written to the access log with the admin's note). */
export const SHOP_ACTION_REASONS = [
  { key: "safety", label: "Fraud, scam or a safety complaint" },
  { key: "policy", label: "Selling something against our rules" },
  { key: "legal", label: "A legal or regulator's request" },
  { key: "owner", label: "The owner asked us to" },
  { key: "resolved", label: "The problem is sorted (restoring)" },
] as const;

export function asShopActionReason(value: unknown) {
  return SHOP_ACTION_REASONS.some((reason) => reason.key === value) ? String(value) : null;
}

export function accessReasonLabel(key: string) {
  return REVEAL_REASONS.find((reason) => reason.key === key)?.label ?? SHOP_ACTION_REASONS.find((reason) => reason.key === key)?.label ?? key;
}

export const ACCESS_ACTION_LABELS: Record<string, string> = {
  reveal_contact: "Viewed contact details",
  suspend_store: "Paused the shop",
  restore_store: "Restored the shop",
};

/** Does this logged reveal still show the contact details to this admin, for this person, now? */
export function revealStillValid(
  row: { adminId: string; subjectUserId: string; action: string; createdAt: Date } | null | undefined,
  adminId: string,
  subjectUserId: string,
  now = new Date(),
) {
  if (!row || row.action !== "reveal_contact" || row.adminId !== adminId || row.subjectUserId !== subjectUserId) return false;
  const age = now.getTime() - row.createdAt.getTime();
  return age >= 0 && age <= REVEAL_MINUTES * 60_000;
}
