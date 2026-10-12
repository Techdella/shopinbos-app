import { NextRequest } from "next/server";
import type { BookingStatus } from "@prisma/client";
import { withLogistics } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { apiError, ok } from "@/lib/api/response";
import { JOB_SELECT, dispatchRiders, jobView, ordersFor, partnerForUser } from "../_shared";

export const dynamic = "force-dynamic";

// Jobs for the delivery partner app: ?view=new | active | done | issues, plus the counts for the filter chips
// and the active riders to assign. Moving a job is POST /api/mobile/logistics/jobs/[id].

const VIEWS: Record<string, BookingStatus[]> = {
  new: ["pending"],
  active: ["confirmed", "picked_up", "in_transit"],
  done: ["delivered", "cancelled"],
  issues: ["failed"],
};

export const GET = withLogistics(async (req: NextRequest, { user }) => {
  const partner = await partnerForUser(user.id);
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);

  const view = VIEWS[req.nextUrl.searchParams.get("view") ?? ""] ? (req.nextUrl.searchParams.get("view") as string) : "active";
  const where = { logisticsPartnerId: partner.id };
  const [jobs, grouped, riders] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { ...where, status: { in: VIEWS[view] } },
      orderBy: view === "done" ? { updatedAt: "desc" } : { createdAt: view === "new" ? "asc" : "desc" },
      take: 60,
      select: JOB_SELECT,
    }),
    db.deliveryBooking.groupBy({ by: ["status"], where, _count: { _all: true } }),
    dispatchRiders(partner.id),
  ]);

  const orders = await ordersFor(jobs);
  const countOf = (statuses: BookingStatus[]) => grouped.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);

  return ok({
    view,
    jobs: jobs.map((job) => jobView(job, job.orderId ? orders.get(job.orderId) : undefined)),
    counts: { new: countOf(VIEWS.new), active: countOf(VIEWS.active), done: countOf(VIEWS.done), issues: countOf(VIEWS.issues) },
    riders,
  });
});
