// Money owed between businesses (prisma BusinessDebt): the rules, shared by the web app and the phone app. Pure (no
// imports) so tests/money-owed.test.mjs can load it directly. src/lib/money-owed/money-owed.server.ts does the
// database and Paystack work.
//
// Shopinbos never holds anyone's money. When something goes wrong in a flow Shopinbos facilitates (a supplier
// paid at checkout who never sent the order, goods that came back wrong or damaged, a parcel lost after pickup),
// the business at fault owes the other one, and Shopinbos keeps the record, decides disputes and makes sure it
// gets paid: in the app (Paystack, split straight to the other business's bank), confirmed by the business owed
// when it was paid another way, or, once overdue, from part of the debtor's share of later sales.
//
// Between a seller and their own customers (refunds, returns, a buyer refusing a parcel) Shopinbos has no part:
// that is the seller's business, under the seller's own return policy.

export const DEBT_REASONS = {
  not_sent: "Paid at checkout but not sent",
  wrong_item: "Wrong item sent",
  damaged: "Arrived damaged or faulty",
  not_as_described: "Not as described",
  short_delivery: "Fewer items than ordered",
  lost_in_transit: "Lost after pickup",
  damaged_in_transit: "Damaged after pickup",
  chargeback: "Card chargeback",
  overpaid: "Paid twice",
  // Who pays when things go wrong (shared/fault-matrix.ts): recorded automatically, taken from the next payments.
  out_of_stock: "Out of stock after payment",
  shipped_late: "Not sent in time",
  delivery_not_made: "Delivery fee for a trip not made",
  delivery_failed: "Delivery failed, item came back",
  returned: "Returned by the customer",
  return_trip: "Delivery trip back",
  other: "Something else",
} as const;

export type DebtReason = keyof typeof DEBT_REASONS;

export function isDebtReason(value: unknown): value is DebtReason {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DEBT_REASONS, value);
}

export function debtReasonLabel(reason: string) {
  return isDebtReason(reason) ? DEBT_REASONS[reason] : DEBT_REASONS.other;
}

/** What a claim is about, which decides who owes: the supplier for their goods, the delivery partner after pickup. */
export type ClaimTarget = "supplier_order" | "wholesale_order" | "booking";

/** The reasons a business can claim for, per kind of order. */
export const CLAIM_REASONS: Record<ClaimTarget, DebtReason[]> = {
  supplier_order: ["wrong_item", "damaged", "not_as_described", "short_delivery", "other"],
  wholesale_order: ["wrong_item", "damaged", "not_as_described", "short_delivery", "other"],
  booking: ["lost_in_transit", "damaged_in_transit", "other"],
};

/** Days a business has to pay what it owes before later sales start paying it off. */
export const PAY_WITHIN_DAYS = 3;
/**
 * Days overdue before the business is paused from new business through Shopinbos (no new listings, shops or
 * wholesale orders; what it already has keeps working, so its sales keep paying the debt off).
 */
export const PAUSE_AFTER_OVERDUE_DAYS = 7;
/** Days the team's "Give more time" adds. */
export const MORE_TIME_DAYS = 7;
/** Days after delivery a business can still claim for goods (the Supplier and Delivery partner terms say the same). */
export const CLAIM_WITHIN_DAYS = 7;
/** How long a deduction planned at checkout holds that part of the debt while the buyer pays. */
export const PLANNED_HOLD_MS = 2 * 60 * 60 * 1000;
/** Paystack won't settle less than this, so nothing smaller is paid in the app or claimed. */
export const MIN_DEBT_KOBO = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEBT_STATUSES = ["claimed", "disputed", "open", "paid", "rejected", "waived"] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

/** Owed now: accepted by the debtor, decided by the team, or automatic. */
export function debtIsOwed(status: string) {
  return status === "open";
}

/** Waiting on someone: the debtor (claimed) or the team (disputed). Nothing is owed yet. */
export function debtIsPending(status: string) {
  return status === "claimed" || status === "disputed";
}

export function dueDate(from: Date) {
  return new Date(from.getTime() + PAY_WITHIN_DAYS * DAY_MS);
}

/** When an overdue debt pauses its debtor: PAUSE_AFTER_OVERDUE_DAYS after it was due. */
export function pausesAt(dueAt: Date) {
  return new Date(dueAt.getTime() + PAUSE_AFTER_OVERDUE_DAYS * DAY_MS);
}

/** The debt pauses its debtor now: still owed, and overdue for PAUSE_AFTER_OVERDUE_DAYS. */
export function debtPauses(debt: { status: string; dueAt: Date | null; amountKobo: number; paidKobo: number }, now = new Date()) {
  return debtIsOwed(debt.status) && remainingKobo(debt) > 0 && debt.dueAt !== null && pausesAt(debt.dueAt).getTime() <= now.getTime();
}

export function remainingKobo(debt: { amountKobo: number; paidKobo: number }) {
  return Math.max(0, debt.amountKobo - debt.paidKobo);
}

/** Past its due date and still owed: later sales pay it off, and the team sees it. */
export function debtIsOverdue(debt: { status: string; dueAt: Date | null; amountKobo: number; paidKobo: number }, now = new Date()) {
  return debtIsOwed(debt.status) && remainingKobo(debt) > 0 && debt.dueAt !== null && debt.dueAt.getTime() <= now.getTime();
}

/** A planned deduction still holds its part of the debt (its checkout may still be paid). */
export function deductionHolds(payment: { status: string; createdAt: Date }, now = new Date()) {
  return payment.status === "planned" && now.getTime() - payment.createdAt.getTime() < PLANNED_HOLD_MS;
}

/** What later sales can still take: what's owed less what other checkouts are holding. */
export function deductibleKobo(debt: { amountKobo: number; paidKobo: number }, heldKobo: number) {
  return Math.max(0, remainingKobo(debt) - Math.max(0, heldKobo));
}

/**
 * A payment of `kobo` towards a debt: what it pays off, and anything paid on top (two payments at once, or a
 * deduction from a sale that was paid late). Excess is owed back the other way, so nobody keeps money twice.
 */
export function applyPayment(debt: { amountKobo: number; paidKobo: number }, kobo: number) {
  const paying = Math.max(0, Math.round(kobo));
  const credit = Math.min(paying, remainingKobo(debt));
  const paidKobo = debt.paidKobo + credit;
  return { credit, excess: paying - credit, paidKobo, settled: paidKobo >= debt.amountKobo };
}

/**
 * Recorded by "who pays when things go wrong" (fault:<case>:<n>) or for a supplier paid at checkout who didn't send
 * (notsent:<id>): owed at once and taken from the business's next payments automatically, so nobody chases anyone.
 */
export function deductsAutomatically(sourceKey: string) {
  return sourceKey.startsWith("fault:") || sourceKey.startsWith("notsent:");
}

/**
 * The line on the debtor's statement when part of a payment went to what they owe: "₦14,250 deducted for order
 * SB-1001: wrong or damaged item, the packing photo showed it (from order SB-2002)". `details` is the debt's own words
 * (its first sentence is enough); `label` the payment it came from.
 */
export function deductionLine(kobo: number, details: string | null | undefined, reason: string, label: string) {
  const amount = `₦${(Math.round(kobo) / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
  const first = (details ?? "").split(/(?<=\.)\s/)[0]?.replace(/\.$/, "").trim();
  const what = first && /^order\s/i.test(first) ? first : `${debtReasonLabel(reason).toLowerCase()}${first ? `: ${first}` : ""}`;
  return `${amount} deducted for ${what} (from ${label})`.slice(0, 300);
}

/** Naira typed by a person ("12,500" or "12500.50") as kobo, or null. */
export function nairaToKobo(value: unknown) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.replace(/[₦,\s]/g, "") : "";
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const kobo = Math.round(Number(text) * 100);
  return Number.isFinite(kobo) && kobo > 0 ? kobo : null;
}

/**
 * Checks a claim before it is raised: a reason that fits the order, an amount between the minimum and what the
 * order was worth, a short account of what happened, and within CLAIM_WITHIN_DAYS of delivery. Null when it's fine.
 */
export function claimProblem(input: { target: ClaimTarget; reason: unknown; amountKobo: number | null; maxKobo: number; details: string; deliveredAt: Date | null; now?: Date }): string | null {
  if (!isDebtReason(input.reason) || !CLAIM_REASONS[input.target].includes(input.reason)) return "Choose what went wrong.";
  if (input.amountKobo === null) return "Enter the amount in naira.";
  if (input.maxKobo < MIN_DEBT_KOBO) return "This order is too small to claim for in the app. Settle it with them directly.";
  if (input.amountKobo < MIN_DEBT_KOBO) return "Claims start at ₦100.";
  if (input.amountKobo > input.maxKobo) return `You can claim at most ₦${(input.maxKobo / 100).toLocaleString("en-NG")}, what this order was worth.`;
  if (input.details.trim().length < 10) return "Say what happened, so they and our team can check it.";
  const now = input.now ?? new Date();
  if (input.deliveredAt && now.getTime() - input.deliveredAt.getTime() > CLAIM_WITHIN_DAYS * DAY_MS) return `Claims must be made within ${CLAIM_WITHIN_DAYS} days of delivery.`;
  return null;
}
