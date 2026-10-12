import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isOnboardingComplete } from "@/lib/role-queries";
import { cashToPayIn, isRiderOut } from "@/lib/logistics/job-rules";
import { owedAfterCredit, payInDue } from "@/lib/logistics/payin-rules";
import { ACTIVE_STATUSES, bookingNet, lagosStartOfToday } from "@/components/logistics/kit";
import { JOB_SELECT, dispatchRiders, jobView, ordersFor, partnerForUser, pickupGeoFor } from "../_shared";

export const dynamic = "force-dynamic";

// "Today" for the delivery partner app (web /logistics/dashboard reads the same numbers on the server):
// delivered and earned today, new / active / issue counts, the new requests, riders out, cash to pay in and on-time %.

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);

  const now = new Date();
  const startOfToday = lagosStartOfToday(now);
  const where = { logisticsPartnerId: partner.id };
  const [newJobs, newCount, quoteCount, activeCount, issueCount, deliveredToday, riders, unremitted, timed] = await Promise.all([
    db.deliveryBooking.findMany({ where: { ...where, status: "pending" }, orderBy: { createdAt: "asc" }, take: 5, select: JOB_SELECT }),
    db.deliveryBooking.count({ where: { ...where, status: "pending" } }),
    db.deliveryQuoteRequest.count({ where: { ...where, status: "pending" } }),
    db.deliveryBooking.count({ where: { ...where, status: { in: ACTIVE_STATUSES } } }),
    db.deliveryBooking.count({ where: { ...where, status: "failed" } }),
    db.deliveryBooking.findMany({ where: { ...where, status: "delivered", deliveredAt: { gte: startOfToday } }, select: { deliveryFee: true, platformFee: true, netAmount: true } }),
    db.logisticsTeamMember.findMany({ where: { ...where, role: "rider", status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, online: true, lastSeenAt: true } }),
    db.deliveryBooking.findMany({ where: { ...where, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } }, orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }], select: { codCollected: true, codMethod: true, remittanceId: true, codCollectedAt: true, createdAt: true } }),
    db.deliveryBooking.findMany({
      where: { ...where, status: "delivered", deliveredAt: { gte: new Date(now.getTime() - MONTH_MS) }, estimatedDelivery: { not: null } },
      select: { deliveredAt: true, estimatedDelivery: true },
    }),
  ]);

  const [orders, riderList, pickupGeo] = await Promise.all([ordersFor(newJobs), dispatchRiders(partner.id, now), pickupGeoFor(newJobs, partner.country)]);
  const out = riders.filter((rider) => isRiderOut(rider, now)).length;
  const onTime = timed.length ? Math.round((timed.filter((job) => job.deliveredAt! <= job.estimatedDelivery!).length / timed.length) * 100) : null;

  return ok({
    partner: {
      name: partner.displayName,
      city: partner.city,
      areas: partner.coverageZones.length ? partner.coverageZones.join(", ") : partner.city,
      logoUrl: partner.logoUrl,
      verificationStatus: partner.verificationStatus,
      onboarded: isOnboardingComplete(partner),
      taking: partner.status === "active",
    },
    firstName: user.name.split(" ")[0] ?? user.name,
    deliveredToday: deliveredToday.length,
    earnedToday: deliveredToday.reduce((sum, job) => sum + bookingNet(job), 0),
    counts: { new: newCount, quotes: quoteCount, active: activeCount, issues: issueCount },
    newJobs: newJobs.map((job) => jobView(job, job.orderId ? orders.get(job.orderId) : undefined, pickupGeo.get(job.id))),
    riders: { total: riders.length, out, offline: riders.length - out },
    riderList,
    // Cash still to pay in after any credit from an earlier pay-in, and when: "by 6pm today" / "now" when late.
    cashToPayIn: owedAfterCredit(cashToPayIn(unremitted), partner.payInCredit),
    payInBy: payInDue(unremitted[0] ? unremitted[0].codCollectedAt ?? unremitted[0].createdAt : null, now).words,
    onTime,
    onTimeJobs: timed.length,
  });
});
