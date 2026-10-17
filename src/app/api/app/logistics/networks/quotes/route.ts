import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { NetworkDeliveryRequestSchema } from "@/lib/schemas";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { CARRIER_QUOTE_TTL_MS } from "@/lib/logistics/carriers/jobs.server";
import { compareNetworks, networkApiError } from "@/lib/logistics/networks.server";

// Live prices for one delivery from every delivery network the seller can book, side by side. Each price is the
// network's own; bookings on Shopinbos's account show the Shopinbos fee as a separate line.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = NetworkDeliveryRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the delivery details.");
  // Each comparison calls every network (and geocodes both addresses).
  if (!(await checkRateLimitShared(rateLimitKey("network-quotes", user.id), { maxRequests: 20, windowMs: 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many price checks. Wait a minute and try again.", 429);
  }
  try {
    const offers = await compareNetworks(user.id, parsed.data);
    return ok({ offers, expiresAt: new Date(Date.now() + CARRIER_QUOTE_TTL_MS) });
  } catch (error) {
    return networkApiError(error);
  }
});
