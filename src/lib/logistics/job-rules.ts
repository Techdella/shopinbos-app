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

export type TransitionCheck = { ok: true } | { ok: false; error: string };

/**
 * Checks a status change before it's saved. Riders and API callers must give the buyer's delivery code
 * (when the job has one) to mark it delivered; the partner's dispatcher can override from the portal.
 * Failing a job needs a reason; pay-on-delivery jobs need the cash/transfer amount when delivered.
 */
export function checkTransition(
  job: { status: string; deliveryCode: string | null; codAmount: number | null },
  input: { to: string; actor: JobActor; code?: string | null; failedReason?: string | null; declineReason?: string | null; codCollected?: number | null; codMethod?: string | null },
): TransitionCheck {
  if (!canMove(job.status, input.to)) return { ok: false, error: "This job has already moved on, so that step isn't possible now. Refresh to see where it is." };
  if (input.to === "declined" && !input.declineReason?.trim()) return { ok: false, error: "Say why you can't take this job, so the shop can send it to another partner." };
  if (input.to === "failed" && !input.failedReason?.trim()) return { ok: false, error: "Say why you couldn't deliver it, for example \"Customer not picking calls\"." };
  if (input.to === "delivered") {
    if (job.deliveryCode && input.actor !== "partner" && input.code?.trim() !== job.deliveryCode) {
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
