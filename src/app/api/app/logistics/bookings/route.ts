import { ownPartCollect } from "@shared/cod-split";
import { deliveryPartnerProblem } from "@/lib/plans/gates.server";
import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, okList, apiError, parsePagination } from "@/lib/api/response";
import { DeliveryBookingCreateSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { emitPartnerEvent } from "@/lib/logistics/webhooks";
import { partnerJob } from "@/lib/logistics/partner-api-core";
import { canOfferJob } from "@/lib/logistics/payin-deadline";
import { notifyJobOffered } from "@/lib/notifications/events.server";
import { payableDeliveryFees } from "@/lib/logistics/delivery-fee-payments.server";
import { partnerJobLimitProblem } from "@/lib/logistics/partner-tiers.server";
import { highValueOrder } from "@/lib/logistics/partner-reach.server";
import { HIGH_VALUE_PARTNER_MESSAGE, canTakeHighValue } from "@shared/partner-reach";

export const GET = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const { page, limit, skip } = parsePagination(req.nextUrl.searchParams);
  const status = req.nextUrl.searchParams.get("status");

  const where = {
    sellerId: user.id,
    ...(status ? { status: status as any } : {}),
  };

  const [total, bookings] = await Promise.all([
    db.deliveryBooking.count({ where }),
    db.deliveryBooking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, pickupLocation: true, destination: true,
        packageDetails: true, deliveryFee: true, currency: true,
        status: true, trackingCode: true, estimatedDelivery: true,
        deliveredAt: true, notes: true, createdAt: true, feePaidAt: true,
        logisticsPartner: { select: { id: true, displayName: true, slug: true, logoUrl: true } },
      },
    }),
  ]);

  // feePayable: the seller can pay this fee by card now, split straight to the partner's bank.
  const payable = await payableDeliveryFees(bookings.map((booking) => booking.id));
  return okList(bookings.map((booking) => ({ ...booking, feePayable: payable.has(booking.id) })), { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = DeliveryBookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const partner = await db.logisticsPartner.findFirst({
    where: { id: parsed.data.logisticsPartnerId, status: "active", verificationStatus: "verified" },
    include: { user: { select: { debtPausedAt: true } } },
  });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);
  // Paused for money long overdue (src/lib/money-owed): shops they already work with can still book them.
  if (partner.user.debtPausedAt && !(await db.deliveryBooking.count({ where: { sellerId: user.id, logisticsPartnerId: partner.id } }))) {
    return apiError("NOT_AVAILABLE", "This delivery partner isn't taking new shops right now. Choose another one.", 409);
  }
  const planProblem = await deliveryPartnerProblem(user.id, partner.id);
  if (planProblem) return apiError("PLAN_LIMIT", planProblem, 402);

  // Unpaid (pay-on-delivery) orders: the rider collects at the door. When suppliers send some of the lines, this
  // parcel collects only the seller's own lines' share, so the customer never pays the total twice.
  const order = parsed.data.orderId
    ? await db.retailOrder.findFirst({
        where: { id: parsed.data.orderId, store: { userId: user.id } },
        select: { total: true, status: true, items: true, paymentMethod: true, supplierOrders: { select: { items: true } } },
      })
    : null;
  const ownShare = order ? ownPartCollect(order.items, order.total, order.supplierOrders.map((part) => part.items)) : 0;
  // Pay on delivery is paid in the app at the door (shared/pay-at-door.ts): the rider never collects it.
  const codAmount = order && order.paymentMethod !== "pay_on_delivery" && (order.status === "pending" || order.status === "awaiting_payment") && ownShare > 0 ? ownShare : undefined;
  // A partner who is late paying in customers' cash gets no new pay-when-it-arrives jobs (prepaid ones still go).
  if (!canOfferJob({ ...partner, verificationStatus: String(partner.verificationStatus) }, { cod: Boolean(codAmount) })) {
    return apiError("CONFLICT", "This delivery company can't take jobs where the customer pays when it arrives right now. Pick another delivery company.", 409);
  }
  // New partners (Verified Individuals, shared/partner-tiers.ts) work within the order value and open-jobs safety limits.
  const limitProblem = await partnerJobLimitProblem(partner.id, order ? Number(order.total) : 0);
  if (limitProblem) return apiError("PARTNER_LIMIT", limitProblem, 409);
  // High-value parcels (shared/partner-reach.ts) only go to Top partners (Tier 3).
  const highValue = order ? await highValueOrder(order) : false;
  if (highValue && !canTakeHighValue(partner.level)) return apiError("PARTNER_LIMIT", HIGH_VALUE_PARTNER_MESSAGE, 409);

  const booking = await db.deliveryBooking.create({
    data: { sellerId: user.id, ...parsed.data, codAmount, highValue },
  });
  void emitPartnerEvent(partner.id, "job.offered", partnerJob(booking)).catch(() => undefined);
  await notifyJobOffered({ bookingId: booking.id, logisticsPartnerId: partner.id });

  return ok(booking, 201);
});
