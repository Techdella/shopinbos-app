import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { emitPartnerEvent } from "@/lib/logistics/webhooks";
import { partnerJob } from "@/lib/logistics/partner-api-core";
import { notifyJobOffered } from "@/lib/notifications/events.server";
import { CarrierContactSchema } from "@/lib/schemas";
import { carrierFor } from "@/lib/logistics/carriers";
import { carrierError, carrierJobInput, createCarrierBooking } from "@/lib/logistics/carriers/jobs.server";

// Seller accepts a partner's quoted price: the quote becomes a booking at that price, offered to the partner
// like any other booking. Only the seller's own quote, only once a price is in and before it expires.
export const POST = withSeller(async (req, { user, params }) => {
  const { id } = await params;
  const quote = await db.deliveryQuoteRequest.findFirst({
    where: { id, sellerId: user.id },
    include: { logisticsPartner: { select: { id: true, status: true, verificationStatus: true, carrier: true } } },
  });
  if (!quote) return apiError("NOT_FOUND", "Quote not found", 404);
  if (quote.status !== "responded" || quote.quotedPrice == null || quote.quotedPrice <= 0) {
    return apiError("BAD_REQUEST", "This quote has no price to accept yet.");
  }
  if (quote.expiresAt && quote.expiresAt.getTime() < Date.now()) {
    return apiError("BAD_REQUEST", "This price has expired. Ask the partner for a new quote.");
  }
  if (quote.logisticsPartner.status !== "active" || quote.logisticsPartner.verificationStatus !== "verified") {
    return apiError("BAD_REQUEST", "This delivery partner isn't taking bookings right now.");
  }

  const details = quote.packageDetails && typeof quote.packageDetails === "object" && !Array.isArray(quote.packageDetails)
    ? (quote.packageDetails as Record<string, unknown>)
    : {};
  // Accept once: a second click (or two tabs) finds the quote no longer "responded".
  const claimed = await db.deliveryQuoteRequest.updateMany({ where: { id: quote.id, status: "responded" }, data: { status: "accepted" } });
  if (claimed.count !== 1) return apiError("CONFLICT", "This quote was already accepted.", 409);

  const data = {
    sellerId: user.id,
    logisticsPartnerId: quote.logisticsPartnerId,
    pickupLocation: quote.pickupLocation,
    destination: quote.destination,
    packageDetails: {
      fragile: details.fragile === true,
      ...(typeof details.weight === "number" ? { weight: details.weight } : {}),
      ...(typeof details.description === "string" ? { description: details.description } : {}),
    },
    ...(quote.preferredDate ? { estimatedDelivery: quote.preferredDate } : {}),
    notes: quote.partnerResponse ? `Quoted: ${quote.partnerResponse}`.slice(0, 1000) : undefined,
  };

  // A company we book through its own API (Kwik): booked with it now, at no more than the quoted price. The
  // customer's name and phone can come with the request ({ recipient }); without them the rider calls the shop.
  const carrier = carrierFor(quote.logisticsPartner);
  if (carrier) {
    const body = (await req.json().catch(() => null)) as { recipient?: unknown } | null;
    const recipient = CarrierContactSchema.safeParse(body?.recipient);
    const job = await carrierJobInput({
      sellerId: user.id,
      pickupLocation: quote.pickupLocation,
      destination: quote.destination,
      recipient: recipient.success ? recipient.data : null,
      weightKg: typeof details.weight === "number" ? details.weight : null,
      pickupAt: quote.preferredDate,
    });
    const res = await createCarrierBooking({ carrier, job, maxPrice: quote.quotedPrice, data }).catch((error) => {
      console.error(`[carrier] could not save the booking for quote ${quote.id}`, error);
      return null;
    });
    if (!res?.ok) {
      // Not booked: the price can be accepted again (or asked for anew once it expires).
      await db.deliveryQuoteRequest.updateMany({ where: { id: quote.id, status: "accepted" }, data: { status: "responded" } });
      return res ? carrierError(res) : apiError("INTERNAL_ERROR", "We couldn't save the booking. Try again.", 500);
    }
    return ok(res.value, 201);
  }

  const booking = await db.deliveryBooking.create({
    data: { ...data, deliveryFee: quote.quotedPrice, currency: "NGN" },
  });
  void emitPartnerEvent(quote.logisticsPartnerId, "job.offered", partnerJob(booking)).catch(() => undefined);
  await notifyJobOffered({ bookingId: booking.id, logisticsPartnerId: quote.logisticsPartnerId, fromQuote: true });

  return ok(booking, 201);
});
