import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { emitPartnerEvent } from "@/lib/logistics/webhooks";
import { partnerJob } from "@/lib/logistics/partner-api-core";
import { queueLifecycleFor } from "@/lib/lifecycle/run.server";

// Seller accepts a partner's quoted price: the quote becomes a booking at that price, offered to the partner
// like any other booking. Only the seller's own quote, only once a price is in and before it expires.
export const POST = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  const quote = await db.deliveryQuoteRequest.findFirst({
    where: { id, sellerId: user.id },
    include: { logisticsPartner: { select: { id: true, status: true, verificationStatus: true } } },
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

  const booking = await db.deliveryBooking.create({
    data: {
      sellerId: user.id,
      logisticsPartnerId: quote.logisticsPartnerId,
      pickupLocation: quote.pickupLocation,
      destination: quote.destination,
      packageDetails: {
        fragile: details.fragile === true,
        ...(typeof details.weight === "number" ? { weight: details.weight } : {}),
        ...(typeof details.description === "string" ? { description: details.description } : {}),
      },
      deliveryFee: quote.quotedPrice,
      currency: "NGN",
      ...(quote.preferredDate ? { estimatedDelivery: quote.preferredDate } : {}),
      notes: quote.partnerResponse ? `Quoted: ${quote.partnerResponse}`.slice(0, 1000) : undefined,
    },
  });
  void emitPartnerEvent(quote.logisticsPartnerId, "job.offered", partnerJob(booking)).catch(() => undefined);
  queueLifecycleFor({ logisticsPartnerId: quote.logisticsPartnerId }); // first booking

  return ok(booking, 201);
});
