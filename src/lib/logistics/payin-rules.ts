// Cash pay-in rules shared by the manual form, the Paystack pay-in account webhook and the admin "assign" action.
// Pure (no imports), unit-tested in tests/payins-and-riders.test.mjs.
//
// A pay-in plus any credit left from earlier pay-ins settles the partner's unremitted cash jobs oldest first, each
// job whole (the same rule as job-rules jobsCoveredBy). What's left becomes credit for the next pay-in, so:
//   exact → every job settled, nothing left over;
//   over  → every job settled, the extra kept as credit;
//   under → some cash still to pay; the part that couldn't settle a whole job waits as credit.

export type PayInOutcome = "exact" | "over" | "under";

export interface PayInApplication {
  /** Jobs this pay-in settles, oldest first. */
  ids: string[];
  /** Cash those jobs held. */
  covered: number;
  /** Credit kept after this pay-in. */
  creditAfter: number;
  /** Cash still to pay in after this pay-in (unsettled jobs minus credit). */
  stillDue: number;
  outcome: PayInOutcome;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Jobs must be sorted oldest first. Amount and credit are in naira. */
export function applyPayIn<T extends { id: string; codCollected: number | null }>(jobs: T[], amount: number, credit = 0): PayInApplication {
  const available = round2(Math.max(0, amount) + Math.max(0, credit));
  const ids: string[] = [];
  let covered = 0;
  for (const job of jobs) {
    const cash = job.codCollected ?? 0;
    if (covered + cash > available + 0.005) break;
    covered = round2(covered + cash);
    ids.push(job.id);
  }
  const creditAfter = round2(Math.max(0, available - covered));
  const left = round2(jobs.filter((job) => !ids.includes(job.id)).reduce((sum, job) => sum + (job.codCollected ?? 0), 0));
  const stillDue = round2(Math.max(0, left - creditAfter));
  const outcome: PayInOutcome = left > 0.005 ? "under" : creditAfter > 0.005 ? "over" : "exact";
  return { ids, covered, creditAfter, stillDue, outcome };
}

/** Cash still to pay in once credit is counted. */
export function owedAfterCredit(cashToPayIn: number, credit: number) {
  return round2(Math.max(0, cashToPayIn - Math.max(0, credit)));
}

/** A transfer into a pay-in account, read from a Paystack charge.success event (channel "dedicated_nuban"). */
export interface DedicatedCharge {
  reference: string;
  /** Naira (Paystack sends kobo). */
  amount: number;
  currency: string;
  accountNumber: string | null;
  customerCode: string | null;
  senderName: string | null;
  senderBank: string | null;
  paidAt: Date;
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** True for Paystack charge.success data paid into a dedicated account (bank transfer to a pay-in account). */
export function isDedicatedCharge(data: unknown) {
  const d = obj(data);
  return d.channel === "dedicated_nuban" || obj(d.authorization).channel === "dedicated_nuban";
}

/** The pay-in a dedicated-account charge describes, or null when it isn't one or is unusable. */
export function readDedicatedCharge(data: unknown): DedicatedCharge | null {
  if (!isDedicatedCharge(data)) return null;
  const d = obj(data);
  if (d.status !== undefined && d.status !== "success") return null;
  const reference = str(d.reference);
  const kobo = typeof d.amount === "number" ? d.amount : Number(d.amount);
  if (!reference || !Number.isFinite(kobo) || kobo <= 0) return null;
  const auth = obj(d.authorization);
  const meta = obj(d.metadata);
  const customer = obj(d.customer);
  const paid = str(d.paid_at) ?? str(d.paidAt) ?? str(d.transaction_date);
  const paidAt = paid && Number.isFinite(new Date(paid).getTime()) ? new Date(paid) : new Date();
  return {
    reference,
    amount: Math.round(kobo) / 100,
    currency: (str(d.currency) ?? "NGN").toUpperCase(),
    accountNumber: str(auth.receiver_bank_account_number) ?? str(meta.receiver_account_number),
    customerCode: str(customer.customer_code),
    senderName: str(auth.sender_name) ?? str(auth.account_name),
    senderBank: str(auth.sender_bank),
    paidAt,
  };
}

/** The account in a dedicatedaccount.assign.success event (or a POST /dedicated_account response's data). */
export function readDedicatedAccount(data: unknown) {
  const d = obj(data);
  const account = Object.keys(obj(d.dedicated_account)).length ? obj(d.dedicated_account) : d;
  const bank = obj(account.bank);
  const customer = Object.keys(obj(d.customer)).length ? obj(d.customer) : obj(account.customer);
  const accountNumber = str(account.account_number);
  return {
    customerCode: str(customer.customer_code),
    customerId: customer.id !== undefined && customer.id !== null ? String(customer.id) : null,
    accountNumber,
    accountName: str(account.account_name),
    bankName: str(bank.name),
    bankSlug: str(bank.slug),
    providerAccountId: account.id !== undefined && account.id !== null ? String(account.id) : null,
  };
}

/**
 * The 6pm pay-in deadline (Lagos time, UTC+1, no daylight saving) for the day `now` falls on in Lagos. Cash
 * collected after 6pm is due by 6pm the next day.
 */
export function payInDeadline(now: Date = new Date()) {
  const LAGOS_OFFSET_MS = 60 * 60 * 1000;
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const sixPm = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate(), 18) - LAGOS_OFFSET_MS;
  return new Date(now.getTime() < sixPm ? sixPm : sixPm + 24 * 60 * 60 * 1000);
}

/**
 * When the cash still held is due: 6pm on the day the oldest unpaid cash was collected (6pm the next day when it
 * was collected after 6pm). words: "by 6pm today" / "by 6pm tomorrow", or "now" once the deadline has passed.
 */
export function payInDue(oldestCollectedAt: Date | null | undefined, now: Date = new Date()) {
  const deadline = payInDeadline(oldestCollectedAt ?? now);
  const late = now.getTime() > deadline.getTime();
  const words = late ? "now" : deadline.getTime() - now.getTime() > 18 * 60 * 60 * 1000 ? "by 6pm tomorrow" : "by 6pm today";
  return { deadline, late, words };
}

/** Plain status for a pay-in in the partner's list. */
export function payInStatusWords(row: { outcome: string | null; covered: number | null; creditAfter: number | null; jobs: number }, naira: (amount: number) => string) {
  const jobs = `${row.jobs} ${row.jobs === 1 ? "job" : "jobs"}`;
  if (row.outcome === "over") return `Matched · ${jobs} · ${naira(row.creditAfter ?? 0)} kept for next time`;
  if (row.outcome === "under") return row.jobs ? `Matched · ${jobs} · some cash still to pay` : "Matched · kept towards your next job";
  if (row.outcome === "exact") return `Matched · ${jobs}`;
  return row.jobs ? `Matched · ${jobs}` : "Saved";
}
