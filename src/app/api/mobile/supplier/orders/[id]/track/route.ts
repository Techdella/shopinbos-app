import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { addressLines } from "@/lib/labels";
import { deliveryTimeline, readDeliveryPlan, type MarketOptionKind } from "@shared/delivery-market";
import { STOPPED_JOB, STOPPED_ORDER, dropshipSteps, trackSteps, trackTitle, wholesaleSteps } from "@shared/supplier-track";
import { supplierForUser } from "../../../_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/supplier/orders/[id]/track?kind=dropship|wholesale: where one of my orders is.
// → { status, title, from, to, partner: { name, phone } | null, eta, timeline: [{ label, at, state }], shareUrl }
//   status: the delivery job's status while a partner carries it, else the order's. eta: the partner's estimated
//   delivery (ISO) or null. timeline: the same steps shops and customers see (deliveryTimeline) when a partner job
//   exists, else the order's own steps; state done | now | todo. shareUrl: the shop's storefront order page
//   (/s/<slug>/order/<cuid>, unguessable) for dropship orders; null for bulk orders. The rider's location is never
//   part of this.

const JOB_SELECT = {
  id: true, status: true, service: true, createdAt: true, acceptedAt: true, readyAt: true, pickedUpAt: true, outForDeliveryAt: true,
  atPickupPointAt: true, deliveredAt: true, estimatedDelivery: true, pickupLocation: true, destination: true, replacedById: true,
  logisticsPartner: { select: { displayName: true, contactPhone: true, whatsappNumber: true } },
} as const;

async function bookingById(id: string | null | undefined) {
  return id ? db.deliveryBooking.findUnique({ where: { id }, select: JOB_SELECT }) : null;
}

function partnerOf(job: { logisticsPartner: { displayName: string; contactPhone: string | null; whatsappNumber: string | null } } | null) {
  return job ? { name: job.logisticsPartner.displayName, phone: job.logisticsPartner.contactPhone ?? job.logisticsPartner.whatsappNumber ?? null } : null;
}

const kindFor = (service: string | null | undefined): MarketOptionKind => (service === "pickup_point" ? "pickup_point" : "doorstep");

export const GET = withSupplier(async (req: NextRequest, { user, params }) => {
  const supplier = await supplierForUser(user.id);
  if (!supplier) return apiError("NOT_FOUND", "Supplier profile not found", 404);
  const id = String(params.id);
  const kind = req.nextUrl.searchParams.get("kind") === "wholesale" ? "wholesale" : "dropship";
  const pickup = await db.supplierPickup.findFirst({ where: { orderKind: kind, orderId: id, supplierId: supplier.id }, select: { status: true, pickupAddress: true, deliveryBookingId: true } });
  const supplierPlace = [supplier.address, supplier.city].filter(Boolean).join(", ") || null;

  if (kind === "wholesale") {
    const order = await db.wholesaleOrder.findFirst({ where: { id, supplierId: supplier.id }, select: { id: true, status: true, createdAt: true, shippedAt: true, deliveredAt: true, deliveryAddress: true } });
    if (!order) return apiError("NOT_FOUND", "Order not found", 404);
    const job = pickup?.status === "cancelled" ? null : await bookingById(pickup?.deliveryBookingId);
    const stopped = STOPPED_ORDER.has(order.status) || (!!job && STOPPED_JOB.has(job.status));
    const steps = job ? deliveryTimeline({ createdAt: order.createdAt, deliveredAt: order.deliveredAt }, job, kindFor(job.service)) : wholesaleSteps(order);
    return ok({
      status: job && !STOPPED_ORDER.has(order.status) ? job.status : order.status,
      title: trackTitle(order.status, job?.status ?? null),
      from: pickup?.pickupAddress ?? job?.pickupLocation ?? supplierPlace,
      to: order.deliveryAddress || job?.destination || null,
      partner: partnerOf(job),
      eta: job?.estimatedDelivery?.toISOString() ?? null,
      timeline: trackSteps(steps, stopped),
      shareUrl: null,
    });
  }

  const order = await db.supplierOrder.findFirst({
    where: { id, supplierId: supplier.id },
    select: {
      id: true, status: true, createdAt: true, acceptedAt: true, packedAt: true, shippedAt: true, deliveredAt: true, shippingAddress: true, selfDelivery: true, retailOrderId: true,
      retailOrder: { select: { id: true, logisticsDetails: true, store: { select: { slug: true, customDomain: true } } } },
    },
  });
  if (!order) return apiError("NOT_FOUND", "Order not found", 404);

  // The partner job carrying this supplier's parcel: the one its rider booking points at, else the plan's, else the
  // latest live job for this supplier's part of the shop's order.
  const shipmentKey = `supplier:${supplier.id}`;
  const plan = readDeliveryPlan(order.retailOrder.logisticsDetails);
  const planned = plan?.shipments.find((part) => part.shipmentKey === shipmentKey) ?? null;
  let job = order.selfDelivery ? null : pickup?.status === "cancelled" ? null : await bookingById(pickup?.deliveryBookingId);
  if (!job && !order.selfDelivery) job = await bookingById(planned?.bookingId);
  if (!job && !order.selfDelivery) {
    job = await db.deliveryBooking.findFirst({
      where: { orderId: order.retailOrderId, shipmentKey, replacedById: null, status: { not: "cancelled" } },
      orderBy: { createdAt: "desc" },
      select: JOB_SELECT,
    });
  }
  const stopped = STOPPED_ORDER.has(order.status) || (!!job && STOPPED_JOB.has(job.status));
  const steps = job ? deliveryTimeline({ createdAt: order.createdAt, deliveredAt: order.deliveredAt }, job, kindFor(job.service ?? planned?.service)) : dropshipSteps(order);
  return ok({
    status: job && !STOPPED_ORDER.has(order.status) ? job.status : order.status,
    title: trackTitle(order.status, job?.status ?? null, !!order.packedAt),
    from: pickup?.pickupAddress ?? job?.pickupLocation ?? supplierPlace,
    to: addressLines(order.shippingAddress).join(", ") || job?.destination || null,
    partner: partnerOf(job),
    eta: job?.estimatedDelivery?.toISOString() ?? null,
    timeline: trackSteps(steps, stopped),
    // The shop's order page on its storefront (the cuid keeps it unguessable), never a short /t/<number> link.
    shareUrl: order.retailOrder.store ? buildStorefrontUrl(order.retailOrder.store, `/order/${order.retailOrder.id}`) : null,
  });
});
