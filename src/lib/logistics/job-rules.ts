// Delivery job rules shared by the partner portal, the Riders app and the partner API. Pure, unit-tested.

export const JOB_STATUSES = [
  "pending",
  "confirmed",
  "picked_up",
  "in_transit",
  "delivered",
  "failed",
  "cancelled",
  // Logistics marketplace (shared/delivery-market.ts, spec §9).
  "declined",
  "out_for_delivery",
  "at_pickup_point",
  "returning",
  "returned",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobActor = "partner" | "rider" | "api";

const NEXT: Record<JobStatus, JobStatus[]> = {
  pending: ["confirmed", "declined", "cancelled"],
  confirmed: ["picked_up", "cancelled", "failed"],
  picked_up: ["in_transit", "out_for_delivery", "at_pickup_point", "delivered", "failed"],
  in_transit: ["out_for_delivery", "at_pickup_point", "delivered", "failed"],
  out_for_delivery: ["delivered", "failed"],
  // Collected by the customer, or not collected in time and sent back.
  at_pickup_point: ["delivered", "returning"],
  delivered: [],
  failed: ["confirmed", "out_for_delivery", "returning"], // retry, re-attempt, or send it back
  returning: ["returned"],
  returned: [],
  declined: [], // the shop sends it to another partner (a new job)
  cancelled: [],
};

export function nextStatuses(current: string): JobStatus[] {
  return NEXT[current as JobStatus] ?? [];
}

export function canMove(from: string, to: string) {
  return nextStatuses(from).includes(to as JobStatus);
}

/**
 * Can a partner keep working the jobs it already has? Verified partners, and suspended ones (spec: a suspended
 * partner leaves checkout and discovery at once, but its existing jobs continue to completion).
 */
export function canWorkExistingJobs(partner: { verificationStatus: string }) {
  return partner.verificationStatus === "verified" || partner.verificationStatus === "suspended";
}

/** 4-digit code the buyer reads to the rider. */
export function makeDeliveryCode(random: () => number = Math.random) {
  return String(Math.floor(random() * 10000)).padStart(4, "0");
}

/**
 * 4-digit code the shop (or supplier) gives the rider at pickup. Never the same as the job's delivery code, so a
 * rider can't mix the two up.
 */
export function makePickupCode(deliveryCode: string | null | undefined, random: () => number = Math.random) {
  for (let tries = 0; tries < 10; tries += 1) {
    const code = makeDeliveryCode(random);
    if (code !== deliveryCode) return code;
  }
  // The random source keeps repeating the delivery code: step to the next number.
  return String((Number(deliveryCode ?? "0") + 1) % 10000).padStart(4, "0");
}

/**
 * The pickup code the rider typed for one job: "none" when the job has no pickup code (accepted before codes
 * existed and no shop screen made one yet; the pickup isn't blocked), "ok" when it matches, "wrong" otherwise.
 */
export function pickupCodeCheck(job: { pickupCode: string | null }, typed: string | null | undefined): "none" | "ok" | "wrong" {
  if (!job.pickupCode) return "none";
  return String(typed ?? "").trim() === job.pickupCode ? "ok" : "wrong";
}

/** startRun's error when a pickup code doesn't match (the phone app shows its own words for it, by this text). */
export const WRONG_PICKUP_CODE = "That pickup code doesn't match. Check it with the shop and try again.";

/**
 * The Riders app's photos of the sealed parcel (shared/fault-matrix.ts: they decide most disputes): at pickup for a
 * shop's or supplier's parcel (a job that carries an order), and at handover for every drop.
 */
export const PICKUP_PHOTO_NEEDED = "Take a photo of the sealed parcel as you pick it up.";
export const HANDOVER_PHOTO_NEEDED = "Take a photo of the parcel as you hand it over. Every delivery needs one.";

export function pickupPhotoProblem(job: { orderId: string | null; pickupPhotoUrl: string | null }) {
  return job.orderId && !job.pickupPhotoUrl ? PICKUP_PHOTO_NEEDED : null;
}

export function handoverPhotoProblem(job: { proofUrl: string | null }) {
  return job.proofUrl ? null : HANDOVER_PHOTO_NEEDED;
}

/** A rider may skip (hand back) a job the partner gave them until they have picked the parcel up. */
export function riderCanSkip(job: { status: string }) {
  return job.status === "confirmed";
}

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is UTC+1 all year (no daylight saving).

/** Start of this week for rider earnings: Monday 00:00 in Lagos, as a UTC instant. */
export function riderWeekStart(now = new Date()) {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const sinceMonday = (lagos.getUTCDay() + 6) % 7;
  const monday = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() - sinceMonday);
  return new Date(monday - LAGOS_OFFSET_MS);
}

// ─── Rider pay ───────────────────────────────────────────────────────────────

export const RIDER_PAY_TYPES = ["per_drop", "share"] as const;
export type RiderPayType = (typeof RIDER_PAY_TYPES)[number];
export type RiderPayRule = { payType: string | null; payRate: number | null };

/** The partner's fee for a job after the Shopinbos fee (what kit.tsx bookingNet shows as "delivery fees"). */
export function jobNetFee(job: { deliveryFee: number; platformFee: number; netAmount: number }) {
  return job.netAmount || job.deliveryFee - (job.platformFee || 0);
}

/** Cleans what a partner typed for a rider's pay. Null clears it; an error when it can't be right. */
export function parseRiderPay(type: unknown, rate: unknown): { ok: true; rule: RiderPayRule } | { ok: false; error: string } {
  const payType = typeof type === "string" ? type.trim() : "";
  if (!payType || payType === "none") return { ok: true, rule: { payType: null, payRate: null } };
  if (!(RIDER_PAY_TYPES as readonly string[]).includes(payType)) return { ok: false, error: "Pick how you pay this rider." };
  const payRate = typeof rate === "number" ? rate : Number(String(rate ?? "").replace(/[₦,\s%]/g, ""));
  if (!Number.isFinite(payRate) || payRate <= 0) return { ok: false, error: "Type how much you pay this rider." };
  if (payType === "share" && payRate > 100) return { ok: false, error: "A share of the fee can't be more than 100%." };
  if (payType === "per_drop" && payRate > 1_000_000) return { ok: false, error: "That's more than a delivery pays. Check the amount." };
  return { ok: true, rule: { payType, payRate: Math.round(payRate * 100) / 100 } };
}

/** What a rider earns for one delivered job under their pay rule, in whole naira. Null when no pay is set. */
export function riderPayFor(rule: RiderPayRule | null | undefined, job: { deliveryFee: number; platformFee: number; netAmount: number }): number | null {
  if (!rule?.payType || !rule.payRate || rule.payRate <= 0) return null;
  if (rule.payType === "per_drop") return Math.round(rule.payRate);
  if (rule.payType === "share") return Math.max(0, Math.round((jobNetFee(job) * Math.min(rule.payRate, 100)) / 100));
  return null;
}

/** A delivered job's earnings: what was saved at delivery, else what the rider's pay gives now. Null: no pay set. */
export function riderEarning(rule: RiderPayRule | null | undefined, job: { deliveryFee: number; platformFee: number; netAmount: number; riderPay?: number | null }) {
  return job.riderPay ?? riderPayFor(rule, job);
}

/**
 * The money figure the Riders app shows for a job: the rider's earnings once the partner has set their pay, else
 * the delivery fee as before.
 */
export function riderAmount(rule: RiderPayRule | null | undefined, job: { deliveryFee: number; platformFee: number; netAmount: number; riderPay?: number | null }) {
  return rule?.payType ? riderEarning(rule, job) ?? 0 : jobNetFee(job);
}

export type TransitionCheck = { ok: true } | { ok: false; error: string };

/**
 * A rider whose customer has no code can still close the drop with a proof-of-delivery photo already on the job and
 * the name of the person who took the parcel (the partner sees both). Two letters at least, so it's a real name.
 */
export function riderProofInstead(job: { proofUrl?: string | null }, input: { actor: JobActor; recipientName?: string | null }) {
  return input.actor === "rider" && Boolean(job.proofUrl?.trim()) && (input.recipientName?.trim().length ?? 0) >= 2;
}

/**
 * Checks a status change before it's saved. Riders and API callers must give the buyer's delivery code
 * (when the job has one) to mark it delivered; the partner's dispatcher can override from the portal, and a rider
 * can instead show a proof photo plus who received it (riderProofInstead).
 * Failing a job needs a reason; pay-on-delivery jobs need the cash/transfer amount when delivered.
 */
export function checkTransition(
  job: { status: string; deliveryCode: string | null; codAmount: number | null; proofUrl?: string | null },
  input: { to: string; actor: JobActor; code?: string | null; recipientName?: string | null; failedReason?: string | null; declineReason?: string | null; codCollected?: number | null; codMethod?: string | null },
): TransitionCheck {
  if (!canMove(job.status, input.to)) return { ok: false, error: "This job has already moved on, so that step isn't possible now. Refresh to see where it is." };
  if (input.to === "declined" && !input.declineReason?.trim()) return { ok: false, error: "Say why you can't take this job, so the shop can send it to another partner." };
  if (input.to === "failed" && !input.failedReason?.trim()) return { ok: false, error: "Say why you couldn't deliver it, for example \"Customer not picking calls\"." };
  if (input.to === "delivered") {
    if (job.deliveryCode && input.actor !== "partner" && input.code?.trim() !== job.deliveryCode && !riderProofInstead(job, input)) {
      if (input.actor === "rider" && !input.code?.trim()) return { ok: false, error: "No code? Take a photo of the parcel at the door and type who received it." };
      return { ok: false, error: "That code doesn't match. Ask the customer for the 4-digit code on their phone." };
    }
    if (job.codAmount && job.codAmount > 0) {
      if (input.codCollected === null || input.codCollected === undefined || input.codCollected < 0) return { ok: false, error: "Type how much the customer paid." };
      if (input.codMethod !== "cash" && input.codMethod !== "transfer") return { ok: false, error: "Pick how the customer paid: cash or transfer." };
    }
  }
  return { ok: true };
}

/** Cash a partner still has to pay in: collected in cash, not yet covered by a remittance. */
export function cashToPayIn(jobs: Array<{ codCollected: number | null; codMethod: string | null; remittanceId: string | null }>) {
  return jobs.reduce((sum, job) => (job.codMethod === "cash" && !job.remittanceId ? sum + (job.codCollected ?? 0) : sum), 0);
}

/** A rider counts as "out" when they switched Online in the Riders app and the app was open recently. */
export const RIDER_ONLINE_WINDOW_MS = 30 * 60 * 1000;

export function isRiderOut(rider: { online: boolean; lastSeenAt: Date | null }, now = new Date()) {
  return rider.online && !!rider.lastSeenAt && now.getTime() - rider.lastSeenAt.getTime() <= RIDER_ONLINE_WINDOW_MS;
}

/**
 * Which unremitted cash jobs a pay-in settles: oldest first, each job whole, stopping at the first one the
 * remaining amount can't cover. Jobs must already be sorted oldest first.
 */
export function jobsCoveredBy<T extends { id: string; codCollected: number | null }>(jobs: T[], amount: number) {
  const ids: string[] = [];
  let covered = 0;
  for (const job of jobs) {
    const cash = job.codCollected ?? 0;
    if (covered + cash > amount + 0.005) break;
    covered += cash;
    ids.push(job.id);
  }
  return { ids, covered };
}
