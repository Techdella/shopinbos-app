import { withSupplier } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { InviteError, cancelSellerInvite } from "@/lib/logistics/invites.server";

// Cancels an invite nobody has accepted yet: its link stops working.
export const DELETE = withSupplier(async (_req, { user, params }) => {
  const { id } = await params;
  try {
    await cancelSellerInvite(user.id, id);
    return ok({ cancelled: true });
  } catch (error) {
    if (error instanceof InviteError) return apiError("CONFLICT", error.message, 409);
    throw error;
  }
});
