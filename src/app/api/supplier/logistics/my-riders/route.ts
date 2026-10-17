import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { FleetRiderSchema } from "@/lib/schemas";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { FleetError, addSellerRider, sellerRiders } from "@/lib/logistics/fleet.server";

// "My riders": the supplier's own delivery riders. GET lists them; POST adds one and returns their private Riders app
// link (shown once) to send them on WhatsApp.
export const GET = withSupplier(async (_req, { user }) => ok(await sellerRiders(user.id)));

export const POST = withSupplier(async (req: NextRequest, { user }) => {
  const parsed = FleetRiderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Add the rider's name and phone number.");
  if (!(await checkRateLimitShared(rateLimitKey("fleet-add", user.id), { maxRequests: 20, windowMs: 60 * 60_000 })).allowed) {
    return apiError("RATE_LIMITED", "Too many riders added at once. Try again later.", 429);
  }
  try {
    return ok(await addSellerRider(user.id, parsed.data), 201);
  } catch (error) {
    if (error instanceof FleetError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
