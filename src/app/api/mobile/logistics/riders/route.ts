import { NextRequest } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { isRiderOut } from "@/lib/logistics/job-rules";
import { bookingNet, lagosStartOfToday } from "@/components/logistics/kit";
import { partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// Riders for the delivery partner app: who is out (online in the Riders app recently), what each one is carrying
// and has delivered today. Adding riders and sending their app links stays on the web (/logistics/couriers).

export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);

  const now = new Date();
  const [riders, open, doneToday] = await Promise.all([
    db.logisticsTeamMember.findMany({
      where: { logisticsPartnerId: partner.id, role: "rider" },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, status: true, online: true, lastSeenAt: true, riderTokenHash: true },
    }),
    db.deliveryBooking.groupBy({ by: ["riderId"], where: { logisticsPartnerId: partner.id, status: { in: ["confirmed", "picked_up", "in_transit"] }, riderId: { not: null } }, _count: { _all: true } }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, status: "delivered", deliveredAt: { gte: lagosStartOfToday(now) }, riderId: { not: null } },
      select: { riderId: true, deliveryFee: true, platformFee: true, netAmount: true },
    }),
  ]);

  const openBy = new Map(open.map((row) => [row.riderId, row._count._all]));
  return ok({
    riders: riders.map((rider) => {
      const done = doneToday.filter((job) => job.riderId === rider.id);
      return {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        active: rider.status === "active",
        out: rider.status === "active" && isRiderOut(rider, now),
        lastSeenAt: rider.lastSeenAt?.toISOString() ?? null,
        hasAppLink: Boolean(rider.riderTokenHash),
        openJobs: openBy.get(rider.id) ?? 0,
        deliveredToday: done.length,
        earnedToday: done.reduce((sum, job) => sum + bookingNet(job), 0),
      };
    }),
  });
});
