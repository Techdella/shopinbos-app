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
import { orderCollectAmount } from "@/lib/logistics/booking.server";

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
        deliveredAt: true, notes: true, createdAt: true,
        logisticsPartner: { select: { id: true, displayName: true, slug: true, logoUrl: true } },
      },
    }),
  ]);

  return okList(bookings, { page, limit, total });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = DeliveryBookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // Private fleets (a seller's own riders) are booked through /api/app/logistics/my-riders/jobs, by their owner only.
  const partner = await db.logisticsPartner.findFirst({
    where: { id: parsed.data.logisticsPartnerId, status: "active", verificationStatus: "verified", ownerId: null },
  });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);

  const codAmount = await orderCollectAmount(user.id, parsed.data.orderId);
  // A partner who is late paying in customers' cash gets no new pay-when-it-arrives jobs (prepaid ones still go).
  if (!canOfferJob({ ...partner, verificationStatus: String(partner.verificationStatus) }, { cod: Boolean(codAmount) })) {
    return apiError("CONFLICT", "This delivery company can't take jobs where the customer pays when it arrives right now. Pick another delivery company.", 409);
  }

  const booking = await db.deliveryBooking.create({
    data: { sellerId: user.id, ...parsed.data, codAmount },
  });
  void emitPartnerEvent(partner.id, "job.offered", partnerJob(booking)).catch(() => undefined);
  await notifyJobOffered({ bookingId: booking.id, logisticsPartnerId: partner.id });

  return ok(booking, 201);
});
