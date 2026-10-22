import { NextRequest, NextResponse } from "next/server";
import { withLogistics } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { toCsv } from "@/lib/csv";
import { planOfUser } from "@/lib/plan-limits";
import { logisticsLimits } from "@shared/plans";

export const dynamic = "force-dynamic";

// GET /api/logistics/analytics/export: the partner's delivery jobs (latest 10,000) as CSV. Pro plan only.
export const GET = withLogistics(async (_req: NextRequest, { user }) => {
  if (logisticsLimits(await planOfUser(user.id)).analytics !== "export") return apiError("PLAN_LIMIT", "Spreadsheet downloads come with the Logistics Pro plan.", 402);
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!partner) return apiError("NOT_FOUND", "Delivery partner profile not found", 404);
  const jobs = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 10_000,
    select: { id: true, createdAt: true, deliveredAt: true, pickupLocation: true, destination: true, deliveryFee: true, platformFee: true, netAmount: true, status: true, seller: { select: { name: true } } },
  });
  const csv = toCsv([
    ["Booked", "Delivered", "Job", "Seller", "Pickup", "Destination", "Fee (NGN)", "Shopinbos fee (NGN)", "You get (NGN)", "Status"],
    ...jobs.map((job) => [
      job.createdAt.toISOString(), job.deliveredAt?.toISOString() ?? "", job.id, job.seller?.name ?? "", job.pickupLocation, job.destination,
      Number(job.deliveryFee), job.platformFee === null ? "" : Number(job.platformFee), job.netAmount === null ? "" : Number(job.netAmount), job.status,
    ]),
  ]);
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="shopinbos-deliveries-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
});
