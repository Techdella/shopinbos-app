import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { NetworkBookSchema } from "@/lib/schemas";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { bookNetwork, networkApiError } from "@/lib/logistics/networks.server";

// Books a delivery with a network at the price the seller saw (a dearer live price is refused). On the seller's
// own network account it's booked at once ({ kind: "booked", booking }); on Shopinbos's account they pay first
// ({ kind: "pay", authorizationUrl }) and it's booked once Paystack confirms the payment.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = NetworkBookSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the delivery details.");
  if (!(await checkRateLimitShared(rateLimitKey("network-book", user.id), { maxRequests: 10, windowMs: 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many bookings at once. Wait a minute and try again.", 429);
  }
  try {
    return ok(await bookNetwork({ id: user.id, email: user.email ?? null }, parsed.data), 201);
  } catch (error) {
    return networkApiError(error);
  }
});
