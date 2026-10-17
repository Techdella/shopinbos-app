import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { FleetError, removeSellerRider } from "@/lib/logistics/fleet.server";

// Removes one of the seller's riders: their Riders app link stops working.
export const DELETE = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  try {
    await removeSellerRider(user.id, id);
    return ok({ removed: true });
  } catch (error) {
    if (error instanceof FleetError) return apiError("CONFLICT", error.message, 409);
    throw error;
  }
});
