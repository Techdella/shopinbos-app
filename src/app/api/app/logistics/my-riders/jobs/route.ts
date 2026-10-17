import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { FleetJobSchema } from "@/lib/schemas";
import { FleetError, bookWithSellerRider } from "@/lib/logistics/fleet.server";

// Gives a delivery to one of the seller's own riders (free: no Shopinbos fee). Returns a WhatsApp message to send them.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = FleetJobSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the delivery details.");
  try {
    return ok(await bookWithSellerRider(user.id, parsed.data), 201);
  } catch (error) {
    if (error instanceof FleetError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
