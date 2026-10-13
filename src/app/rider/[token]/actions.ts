"use server";

import { db } from "@/lib/db/client";
import { transitionJob } from "@/lib/logistics/jobs";
import { riderFromToken, type RiderSession } from "@/lib/logistics/rider-session";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { getT } from "@/lib/i18n/server";
import { jobErrorWords } from "@/components/logistics/job-errors";

// Riders app actions. Each one re-checks the private link token, and jobs only move through transitionJob
// with the rider's id, so a rider can only touch jobs assigned to them.

export type RiderActionResult = { ok: true } | { ok: false; error: string };

// Messages are in the rider's language (sib_lang cookie or the phone's language), "rider" namespace.
async function rider(token: string): Promise<{ ok: true; rider: RiderSession } | { ok: false; error: string }> {
  const session = await riderFromToken(String(token ?? ""));
  if (!session.ok) {
    const t = await getT("rider");
    return { ok: false, error: session.reason === "limited" ? t("error.limit") : t("error.link") };
  }
  return { ok: true, rider: session.rider };
}

/** A job rule's error (lib/logistics/jobs.ts, job-rules.ts) in the rider's language. */
async function inRiderWords(result: RiderActionResult): Promise<RiderActionResult> {
  if (result.ok) return result;
  return { ok: false, error: jobErrorWords(await getT("logistics"), result.error) };
}

export async function setRiderOnline(token: string, online: boolean): Promise<RiderActionResult> {
  const session = await rider(token);
  if (!session.ok) return session;
  await db.logisticsTeamMember.update({ where: { id: session.rider.id }, data: { online: Boolean(online), lastSeenAt: new Date() } });
  return { ok: true };
}

/** "Accept run": the rider has the parcels for a pickup, so its confirmed jobs move to picked up. */
export async function startRun(token: string, jobIds: string[]): Promise<RiderActionResult> {
  const session = await rider(token);
  if (!session.ok) return session;
  const ids = Array.isArray(jobIds) ? jobIds.filter((id) => typeof id === "string").slice(0, 50) : [];
  const jobs = await db.deliveryBooking.findMany({
    where: { id: { in: ids }, riderId: session.rider.id, logisticsPartnerId: session.rider.partnerId, status: "confirmed" },
    select: { id: true },
  });
  if (jobs.length === 0) return { ok: false, error: (await getT("rider"))("error.nothingLeft") };
  for (const job of jobs) {
    const result = await transitionJob({ bookingId: job.id, partnerId: session.rider.partnerId, to: "picked_up", actor: "rider", riderId: session.rider.id });
    if (!result.ok) return inRiderWords(result);
  }
  if (!session.rider.online) await db.logisticsTeamMember.update({ where: { id: session.rider.id }, data: { online: true } });
  return { ok: true };
}

export async function markDelivered(
  token: string,
  input: { jobId: string; code: string; codCollected?: number | null; codMethod?: string | null },
): Promise<RiderActionResult> {
  const session = await rider(token);
  if (!session.ok) return session;
  const jobId = String(input?.jobId ?? "");
  // Delivery codes are 4 digits, so guesses are capped per job across every server instance (fails closed).
  if (!(await checkRateLimitShared(rateLimitKey("rider:code", jobId), { maxRequests: 6, windowMs: 15 * 60_000, failClosed: true })).allowed) {
    return { ok: false, error: (await getT("rider"))("error.tooManyCodes") };
  }
  const collected = input?.codCollected === null || input?.codCollected === undefined ? null : Number(input.codCollected);
  return inRiderWords(await transitionJob({
    bookingId: jobId,
    partnerId: session.rider.partnerId,
    to: "delivered",
    actor: "rider",
    riderId: session.rider.id,
    code: String(input?.code ?? "").trim(),
    codCollected: collected !== null && Number.isFinite(collected) ? collected : null,
    codMethod: input?.codMethod === "cash" || input?.codMethod === "transfer" ? input.codMethod : null,
  }));
}

export async function markFailed(token: string, input: { jobId: string; reason: string }): Promise<RiderActionResult> {
  const session = await rider(token);
  if (!session.ok) return session;
  return inRiderWords(await transitionJob({
    bookingId: String(input?.jobId ?? ""),
    partnerId: session.rider.partnerId,
    to: "failed",
    actor: "rider",
    riderId: session.rider.id,
    failedReason: String(input?.reason ?? "").slice(0, 300),
  }));
}
