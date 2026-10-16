import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { CarrierLiveQuoteSchema } from "@/lib/schemas";
import type { AuthUser } from "@/lib/auth/types";
import { carrierFor } from "@/lib/logistics/carriers";
import { CARRIER_QUOTE_TTL_MS, carrierError, carrierJobInput } from "@/lib/logistics/carriers/jobs.server";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";

// The live price of a delivery with a company we book through its own API (LogisticsPartner.carrier, e.g. Kwik).
// Book it with POST /api/app/logistics/bookings, sending this price as deliveryFee: a dearer price at booking time
// is refused rather than charged.
export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const body = await req.json().catch(() => null);
  const parsed = CarrierLiveQuoteSchema.safeParse(body);
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");

  const partner = await db.logisticsPartner.findFirst({
    where: { id: parsed.data.logisticsPartnerId, status: "active", verificationStatus: "verified" },
    select: { id: true, carrier: true, displayName: true },
  });
  if (!partner) return apiError("NOT_FOUND", "Logistics partner not found", 404);
  const carrier = carrierFor(partner);
  if (!carrier) return apiError("BAD_REQUEST", `${partner.displayName} prices each delivery themselves. Ask them for a quote.`);

  // Each price check is two calls to the carrier (and geocoding).
  if (!(await checkRateLimitShared(rateLimitKey("carrier-quote", user.id), { maxRequests: 30, windowMs: 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many price checks. Wait a minute and try again.", 429);
  }

  const job = await carrierJobInput({
    sellerId: user.id,
    pickupLocation: parsed.data.pickupLocation,
    destination: parsed.data.destination,
    orderId: parsed.data.orderId,
    recipient: parsed.data.recipient,
    pickupPhone: parsed.data.pickupPhone,
    weightKg: parsed.data.packageDetails?.weight,
  });
  const res = await carrier.quote(job);
  if (!res.ok) return carrierError(res);
  return ok({
    logisticsPartnerId: partner.id,
    carrier: carrier.id,
    price: res.value.price,
    currency: res.value.currency,
    expiresAt: new Date(Date.now() + CARRIER_QUOTE_TTL_MS),
  });
});
