import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { ensurePickupCode } from "@/lib/logistics/jobs";
import { canReassign, deliveryTimeline, jobException, partnerShipments, readDeliveryPlan } from "@shared/delivery-market";

export const dynamic = "force-dynamic";

// GET /api/mobile/delivery/orders/[orderId]: how one order is being delivered (as on the web order page's delivery
// card). The plan chosen at checkout (partner doorstep or pickup point, pick up from the shop, or the shop's own
// delivery), and for each parcel a partner carries: the partner, service, fee, status, timeline, the customer's
// delivery code, whether it's ready for pickup, why it needs the shop (declined, not accepted, late pickup, failed),
// whether it can go to another partner, and the pay-on-delivery cash record.
export const GET = withSeller(async (_req: NextRequest, { user, params }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const order = store ? await db.retailOrder.findFirst({ where: { id: String(params.orderId), storeId: store.id }, select: { id: true, createdAt: true, deliveredAt: true, logisticsDetails: true, paymentMethod: true } }) : null;
  if (!order) return apiError("NOT_FOUND", "We couldn't find that order.", 404);
  const plan = readDeliveryPlan(order.logisticsDetails);
  if (!plan) return ok({ plan: null, parcels: [] });

  const parts = partnerShipments(plan);
  const jobs = await db.deliveryBooking.findMany({
    where: { orderId: order.id, sellerId: user.id, status: { not: "cancelled" } },
    orderBy: { createdAt: "asc" },
    include: { logisticsPartner: { select: { id: true, slug: true, displayName: true, userId: true } }, rider: { select: { name: true } } },
  });
  const now = new Date();
  // The code the shop gives the rider at pickup, while the job waits for them (made now for older jobs).
  const pickupCodes = new Map(await Promise.all(jobs.map(async (job) => [job.id, await ensurePickupCode(job).catch(() => null)] as const)));
  const parcels = parts.map((part) => {
    // The live job for this parcel: the one the plan points at, else the latest not yet replaced.
    const job = jobs.find((entry) => entry.id === part.bookingId) ?? jobs.filter((entry) => (entry.shipmentKey ?? "own") === part.shipmentKey && !entry.replacedById).pop() ?? null;
    const exception = job ? jobException(job, now) : null;
    return {
      shipmentKey: part.shipmentKey,
      service: part.service,
      sizeBand: part.sizeBand,
      fee: job?.deliveryFee ?? part.price,
      minDays: part.minDays,
      maxDays: part.maxDays,
      partner: job ? { id: job.logisticsPartner.id, slug: job.logisticsPartner.slug, name: job.logisticsPartner.displayName, userId: job.logisticsPartner.userId } : null,
      job: job
        ? {
            id: job.id,
            status: job.status,
            readyAt: job.readyAt,
            deliveryCode: job.deliveryCode,
            pickupCode: pickupCodes.get(job.id) ?? null,
            declineReason: job.declineReason,
            failedReason: job.failedReason,
            rider: job.rider?.name ?? null,
            codAmount: job.codAmount,
            codRemittedAt: job.codRemittedAt,
            codConfirmedAt: job.codConfirmedAt,
          }
        : null,
      exception,
      canReassign: !!job && canReassign(exception),
      timeline: deliveryTimeline(order, job, plan.kind),
    };
  });
  return ok({
    plan: { kind: plan.kind, pod: plan.pod },
    // Pick up from the shop, or the shop's own flat-fee delivery: no partner job, just the order's own steps.
    timeline: parts.length ? null : deliveryTimeline(order, null, plan.kind),
    parcels,
  });
});
