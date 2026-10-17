import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { FleetError, newSellerRiderLink } from "@/lib/logistics/fleet.server";

// A new private Riders app link for one of the seller's riders (shown once; the old link stops working).
export const POST = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  try {
    return ok(await newSellerRiderLink(user.id, id));
  } catch (error) {
    if (error instanceof FleetError) return apiError("NOT_FOUND", error.message, 404);
    throw error;
  }
});
