import "server-only";
import { db } from "@/lib/db/client";
import { isLatLng } from "@shared/delivery-geo";
import type { RiderSession } from "./rider-session";

// Rider locations from the Riders app (POST /api/mobile/logistics/rider/location). We keep:
//   - the rider's latest location only (LogisticsTeamMember.lastLat / lastLng / lastAccuracy / lastLocationAt), for
//     "closest rider" and "last seen 2 min ago, Ikeja" on the partner's screens;
//   - a short trail per job the rider is carrying (RiderLocationPoint), deleted 7 days after delivery.
// Locations are only taken while the rider is online or on a job, and are never sent to shops or customers.

export const ACTIVE_JOB_STATUSES = ["confirmed", "picked_up", "in_transit"] as const;
const TRAIL_STATUSES = ["picked_up", "in_transit"];
const TRAIL_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_POINT_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const CLEANUP_EVERY_MS = 60 * 60 * 1000;

export interface ReportedPoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  /** Epoch ms or ISO time the phone took the reading. */
  at: number | string;
}

export type LocationReport = { ok: true; saved: number; latest: Date | null } | { ok: false; reason: "not_active" | "no_points" };

/** Usable points, oldest first: real coordinates, taken in the last 12 hours, not in the future. */
export function cleanPoints(points: ReportedPoint[], now = Date.now()) {
  return points
    .map((point) => ({ lat: point.lat, lng: point.lng, accuracy: typeof point.accuracy === "number" && Number.isFinite(point.accuracy) && point.accuracy >= 0 ? Math.min(point.accuracy, 100_000) : null, at: new Date(point.at) }))
    .filter((point) => isLatLng(point) && Number.isFinite(point.at.getTime()) && point.at.getTime() <= now + MAX_FUTURE_MS && now - point.at.getTime() <= MAX_POINT_AGE_MS)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

let lastCleanup = 0;

/** Deletes trails of jobs that finished more than 7 days ago (and any trail point older than 30 days). */
export async function deleteOldTrails(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRAIL_KEEP_MS);
  const finished = await db.riderLocationPoint.deleteMany({
    where: {
      booking: {
        status: { in: ["delivered", "cancelled", "failed"] },
        OR: [{ deliveredAt: { lt: cutoff } }, { deliveredAt: null, updatedAt: { lt: cutoff } }],
      },
    },
  });
  const ancient = await db.riderLocationPoint.deleteMany({ where: { at: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } } });
  return finished.count + ancient.count;
}

export async function recordRiderLocations(rider: RiderSession, points: ReportedPoint[]): Promise<LocationReport> {
  const clean = cleanPoints(points).slice(-20);
  if (!clean.length) return { ok: false, reason: "no_points" };

  const [member, jobs] = await Promise.all([
    db.logisticsTeamMember.findUnique({ where: { id: rider.id }, select: { online: true, lastLocationAt: true } }),
    db.deliveryBooking.findMany({ where: { riderId: rider.id, logisticsPartnerId: rider.partnerId, status: { in: [...ACTIVE_JOB_STATUSES] } }, select: { id: true, status: true } }),
  ]);
  // Only while online or on a job: an offline rider with nothing to carry isn't tracked.
  if (!member || (!member.online && jobs.length === 0)) return { ok: false, reason: "not_active" };

  const latest = clean[clean.length - 1];
  if (!member.lastLocationAt || latest.at > member.lastLocationAt) {
    await db.logisticsTeamMember.update({
      where: { id: rider.id },
      data: { lastLat: latest.lat, lastLng: latest.lng, lastAccuracy: latest.accuracy, lastLocationAt: latest.at },
    });
  }

  const carrying = jobs.filter((job) => TRAIL_STATUSES.includes(job.status));
  if (carrying.length) {
    await db.riderLocationPoint.createMany({
      data: carrying.flatMap((job) => clean.map((point) => ({ riderId: rider.id, bookingId: job.id, lat: point.lat, lng: point.lng, accuracy: point.accuracy, at: point.at }))),
    });
  }

  if (Date.now() - lastCleanup > CLEANUP_EVERY_MS) {
    lastCleanup = Date.now();
    void deleteOldTrails().catch((error) => console.warn("[rider location] trail cleanup failed", error));
  }
  return { ok: true, saved: clean.length, latest: latest.at };
}

export const RIDER_LOCATION_SELECT = { lastLat: true, lastLng: true, lastLocationAt: true } as const;
