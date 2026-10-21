import "server-only";

import { db } from "@/lib/db/client";
import { readRateRows } from "@shared/delivery-market";
import { deliveryTotals, isDeclined, isNotAcceptedInTime, type AnalyticsJob } from "@/lib/delivery-market/analytics";
import { jobsByRoute, rateBenchmarks, routeEnd } from "./roles";

// What a delivery partner's Peggy knows (read-only, GET/POST /api/mobile/peggy): jobs by route over the last 90
// days, missed and declined offers, on-time and acceptance rates, and their public rate card against the median of
// other partners' public cards for the same route. Other partners' cards are public (sellers compare them at
// checkout); only the medians go into the context, never another partner's name. Reads only.

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const MAX_JOBS = 2000;
const MAX_OTHER_CARDS = 300;

async function safe<T>(query: Promise<T>, fallback: T): Promise<T> {
  return query.catch((error) => {
    console.error("[peggy/partner-context] query failed", error);
    return fallback;
  });
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;
const ref = (id: string) => `J-${id.slice(-6).toUpperCase()}`;

export async function buildPartnerSnapshot(userId: string, now = new Date()) {
  const partner = await db.logisticsPartner.findUnique({
    where: { userId },
    select: { id: true, displayName: true, companyName: true, city: true, coverageZones: true, rating: true, ratingCount: true, verificationStatus: true },
  });
  if (!partner) return { partner: null, firstName: null, missedJob: false, snapshot: { note: "No delivery company profile yet. Finish signing up in the app first." } };
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);

  const [jobs, myCard, otherCards, pickupPoints] = await Promise.all([
    safe(db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_JOBS,
      select: {
        id: true, status: true, createdAt: true, deliveryFee: true, netAmount: true, pickupLocation: true, destination: true,
        acceptBy: true, acceptedAt: true, declinedAt: true, declineReason: true, pickedUpAt: true, deliveredAt: true,
        estimatedDelivery: true, failedAttempts: true, feePaidAt: true, replacedById: true, service: true, sizeBand: true,
      },
    }), []),
    safe(db.logisticsRateCard.findFirst({ where: { logisticsPartnerId: partner.id, ownerUserId: null, status: "active" }, orderBy: { createdAt: "desc" }, select: { rows: true, failedAttemptFee: true, returnFee: true } }), null),
    safe(db.logisticsRateCard.findMany({
      where: { logisticsPartnerId: { not: partner.id }, ownerUserId: null, status: "active" },
      orderBy: { updatedAt: "desc" },
      take: MAX_OTHER_CARDS,
      select: { logisticsPartnerId: true, rows: true },
    }), []),
    safe(db.logisticsPickupPoint.count({ where: { logisticsPartnerId: partner.id, active: true } }), 0),
  ]);

  const analytics: AnalyticsJob[] = jobs.map((job) => ({ ...job, deliveryFee: job.netAmount || job.deliveryFee }));
  const totals = deliveryTotals(analytics, now);
  const missed = jobs
    .filter((job, index) => isDeclined(analytics[index]) || isNotAcceptedInTime(analytics[index], now))
    .slice(0, 10)
    .map((job) => ({
      ref: ref(job.id),
      route: `${routeEnd(job.pickupLocation)} → ${routeEnd(job.destination)}`,
      fee: naira(job.netAmount || job.deliveryFee),
      what: job.status === "declined" || job.declinedAt ? "you declined it" : job.replacedById ? "not accepted in time, so the shop sent it to another partner" : "not accepted in time",
      reason: job.declineReason ?? null,
      date: job.createdAt.toISOString().slice(0, 10),
    }));

  // One card per other partner (their newest active one).
  const seen = new Set<string>();
  const others = otherCards.filter((card) => (seen.has(card.logisticsPartnerId) ? false : (seen.add(card.logisticsPartnerId), true))).map((card) => readRateRows(card.rows));
  const mine = myCard ? readRateRows(myCard.rows) : [];

  const snapshot = {
    company: { name: partner.displayName || partner.companyName, city: partner.city, coverage: partner.coverageZones.slice(0, 20), verified: partner.verificationStatus === "verified", rating: partner.ratingCount ? partner.rating : null, pickupPoints },
    windowDays: WINDOW_DAYS,
    totals: {
      offered: totals.offered,
      accepted: totals.accepted,
      declined: totals.declined,
      notAcceptedInTime: totals.notAcceptedInTime,
      delivered: totals.delivered,
      acceptanceRatePercent: totals.acceptanceRate,
      onTimeRatePercent: totals.onTimeRate,
      onTimeFrom: totals.timed,
      failedRatePercent: totals.failedRate,
      earnedFromDelivered: naira(totals.fees),
    },
    routes: jobsByRoute(jobs.map((job) => ({ id: job.id, from: job.pickupLocation, to: job.destination, status: job.status, fee: job.netAmount || job.deliveryFee }))).map((row) => ({ ...row, earned: naira(row.earned) })),
    missed,
    rates: myCard
      ? {
          failedAttemptFee: naira(myCard.failedAttemptFee),
          returnFee: naira(myCard.returnFee),
          rows: rateBenchmarks(mine, others).slice(0, 40).map((row) => ({ ...row, yourPrice: naira(row.yourPrice), othersMedian: row.othersMedian === null ? null : naira(row.othersMedian) })),
          otherPartnersWithCards: others.length,
        }
      : { note: "No public rate card yet. They can add one in Rates." },
  };

  return { partner, firstName: partner.displayName || partner.companyName, missedJob: missed.length > 0, snapshot };
}
