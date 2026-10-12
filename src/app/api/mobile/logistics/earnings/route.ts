import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { cashToPayIn } from "@/lib/logistics/job-rules";
import { bookingNet, jobId, lagosStartOfToday } from "@/components/logistics/kit";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// Earnings and cash for the delivery partner app: what was earned today / this week / in 30 days (after the
// Shopinbos fee), cash still to pay in, recent pay-ins and the payout bank. Changing the bank stays on the web.

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);

  const now = new Date();
  const today = lagosStartOfToday(now);
  const monthAgo = new Date(today.getTime() - 29 * DAY_MS);
  const weekAgo = new Date(today.getTime() - 6 * DAY_MS);
  const [delivered, unremitted, remittances, bank] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, status: "delivered", deliveredAt: { gte: monthAgo } },
      orderBy: { deliveredAt: "desc" },
      select: { id: true, destination: true, pickupLocation: true, deliveredAt: true, deliveryFee: true, platformFee: true, netAmount: true, rider: { select: { name: true } } },
    }),
    db.deliveryBooking.findMany({ where: { logisticsPartnerId: partner.id, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } }, select: { codCollected: true, codMethod: true, remittanceId: true } }),
    db.codRemittance.findMany({ where: { logisticsPartnerId: partner.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, amount: true, method: true, reference: true, createdAt: true } }),
    db.logisticsPayoutAccount.findUnique({ where: { logisticsPartnerId: partner.id }, select: { bankName: true, accountNumberMask: true, accountName: true, verificationStatus: true } }),
  ]);

  const sum = (from: Date) => delivered.filter((job) => job.deliveredAt && job.deliveredAt >= from).reduce((total, job) => total + bookingNet(job), 0);
  const count = (from: Date) => delivered.filter((job) => job.deliveredAt && job.deliveredAt >= from).length;

  return ok({
    today: { amount: sum(today), jobs: count(today) },
    week: { amount: sum(weekAgo), jobs: count(weekAgo) },
    month: { amount: sum(monthAgo), jobs: count(monthAgo) },
    cashToPayIn: cashToPayIn(unremitted),
    remittances: remittances.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    recent: delivered.slice(0, 15).map((job) => ({
      id: job.id,
      ref: jobId(job.id),
      from: job.pickupLocation,
      to: job.destination,
      rider: job.rider?.name ?? null,
      deliveredAt: job.deliveredAt?.toISOString() ?? null,
      amount: bookingNet(job),
    })),
    bank: bank ? { bankName: bank.bankName, account: bank.accountNumberMask, accountName: bank.accountName, ready: bank.verificationStatus === "verified" } : null,
  });
});
