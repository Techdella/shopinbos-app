import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { areaFromText } from "@shared/delivery-geo";
import { riderAmount, riderCanSkip, riderWeekStart } from "./job-rules";
import type { RiderSession } from "./rider-session";

// The phone Riders app's own steps (src/app/api/mobile/logistics/rider): skip a job the partner gave the rider, ask
// the company for help without failing the job, check the customer's code before the cash step, save the rider's
// language, and this week's earnings. Every step only touches jobs assigned to this rider.

export type RiderStepResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "WRONG_CODE"; error: string };

export const RIDER_LANGUAGES = ["en", "pcm", "yo", "ha", "ig"] as const;
export type RiderLanguage = (typeof RIDER_LANGUAGES)[number];

const short = (text: string, max = 50) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

async function riderJob(rider: RiderSession, jobId: string) {
  return db.deliveryBooking.findFirst({
    where: { id: jobId, riderId: rider.id, logisticsPartnerId: rider.partnerId },
    select: { id: true, status: true, pickupLocation: true, destination: true, deliveryCode: true },
  });
}

async function partnerUserId(partnerId: string) {
  return (await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { userId: true } }))?.userId ?? null;
}

async function riderPhone(riderId: string) {
  return (await db.logisticsTeamMember.findUnique({ where: { id: riderId }, select: { phone: true } }))?.phone ?? null;
}

/** "Skip": the rider hands back a job they haven't picked up. It goes back to the partner to give to someone else. */
export async function skipJob(rider: RiderSession, jobId: string): Promise<RiderStepResult> {
  const job = await riderJob(rider, jobId);
  if (!job) return { ok: false, code: "NOT_FOUND", error: "This job isn't assigned to you any more. Pull down to refresh." };
  if (!riderCanSkip(job)) return { ok: false, code: "CONFLICT", error: "You've already picked this one up. Tap \"Something wrong?\" to tell your company." };
  // Only if it's still theirs and still waiting (two taps, or the partner moving it at the same moment).
  const moved = await db.deliveryBooking.updateMany({ where: { id: job.id, riderId: rider.id, status: "confirmed" }, data: { riderId: null } });
  if (moved.count !== 1) return { ok: false, code: "CONFLICT", error: "This job has already moved on. Pull down to refresh." };

  const userId = await partnerUserId(rider.partnerId);
  if (userId) {
    await createNotification({
      userId,
      type: "logistics",
      priority: "warning",
      event: "job.update",
      title: `${rider.name} skipped a job`,
      description: `${short(job.pickupLocation)} to ${short(job.destination)}. Give it to another rider.`,
      link: `/logistics/bookings?job=${job.id}`,
      actionLabel: "Pick a rider",
      metadata: { bookingId: job.id, riderId: rider.id },
      dedupeKey: `rider.skip:${job.id}:${rider.id}`,
    }).catch(() => null);
  }
  return { ok: true };
}

/** "Need help?": tells the partner what's wrong. The job keeps its status; the partner calls the rider. */
export async function askForHelp(rider: RiderSession, jobId: string, reason: string): Promise<RiderStepResult> {
  const job = await riderJob(rider, jobId);
  if (!job) return { ok: false, code: "NOT_FOUND", error: "This job isn't assigned to you any more. Pull down to refresh." };
  if (!(await checkRateLimitShared(rateLimitKey("rider:help", job.id), { maxRequests: 10, windowMs: 60 * 60_000 })).allowed) {
    return { ok: false, code: "RATE_LIMITED", error: "Your company already has your messages. Call them if it's urgent." };
  }
  const userId = await partnerUserId(rider.partnerId);
  if (!userId) return { ok: false, code: "NOT_FOUND", error: "We couldn't reach your company. Call them instead." };
  const phone = await riderPhone(rider.id);
  const why = reason.trim().slice(0, 200);
  await createNotification({
    userId,
    type: "logistics",
    priority: "critical",
    urgent: true,
    event: "job.update",
    title: `${rider.name} needs help: ${why}`,
    description: `${short(job.pickupLocation)} to ${short(job.destination)}.${phone ? ` Call ${rider.name.split(" ")[0]} on ${phone}.` : ""}`,
    link: `/logistics/bookings?job=${job.id}`,
    actionLabel: "See the job",
    metadata: { bookingId: job.id, riderId: rider.id, reason: why },
    dedupeKey: `rider.help:${job.id}:${why.toLowerCase()}`,
  });
  return { ok: true };
}

/**
 * Checks the customer's 4-digit code before the cash step, so the rider knows it's right before taking the money.
 * Shares the guess limit with "delivered" (rider:code), so checking first never gives extra guesses.
 */
export async function checkDeliveryCode(rider: RiderSession, jobId: string, code: string): Promise<RiderStepResult> {
  if (!(await checkRateLimitShared(rateLimitKey("rider:code", jobId), { maxRequests: 6, windowMs: 15 * 60_000, failClosed: true })).allowed) {
    return { ok: false, code: "RATE_LIMITED", error: "Too many tries for this code. Wait 15 minutes or call your company." };
  }
  const job = await riderJob(rider, jobId);
  if (!job) return { ok: false, code: "NOT_FOUND", error: "This job isn't assigned to you any more. Pull down to refresh." };
  if (job.deliveryCode && code.trim() !== job.deliveryCode) return { ok: false, code: "WRONG_CODE", error: "That code doesn't match. Check and try again." };
  return { ok: true };
}

export async function saveRiderLanguage(rider: RiderSession, language: RiderLanguage) {
  await db.logisticsTeamMember.update({ where: { id: rider.id }, data: { language } });
}

/**
 * This week's deliveries (Monday 00:00 Lagos onwards), newest first, with the same per-job amount as "earned today":
 * the rider's earnings once the partner has set their pay, else the delivery fee.
 */
export async function riderWeek(rider: RiderSession, now = new Date()) {
  const jobs = await db.deliveryBooking.findMany({
    where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, status: "delivered", deliveredAt: { gte: riderWeekStart(now) } },
    orderBy: { deliveredAt: "desc" },
    take: 200,
    select: { id: true, deliveredAt: true, pickupLocation: true, destination: true, deliveryFee: true, platformFee: true, netAmount: true, riderPay: true, seller: { select: { name: true, store: { select: { name: true } } } } },
  });
  const deliveries = jobs.map((job) => ({
    id: job.id,
    // "Surulere → Ikeja": known areas when the addresses name one, else the shop and the drop as written.
    from: areaFromText(job.pickupLocation)?.name ?? job.seller.store?.name ?? job.seller.name,
    to: areaFromText(job.destination)?.name ?? job.destination,
    deliveredAt: (job.deliveredAt ?? now).toISOString(),
    amount: riderAmount(rider, job),
  }));
  return { total: deliveries.reduce((sum, job) => sum + job.amount, 0), count: deliveries.length, deliveries };
}
