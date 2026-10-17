import { NextRequest } from "next/server";
import { withSupplier } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { FleetJobMoveSchema } from "@/lib/schemas";
import { FleetError, moveSellerRiderJob } from "@/lib/logistics/fleet.server";

// The supplier moves one of their own riders' deliveries (picked up, delivered, failed), e.g. for a rider without a
// smartphone.
export const POST = withSupplier(async (req: NextRequest, { user, params }) => {
  const { id } = await params;
  const parsed = FleetJobMoveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick picked up, delivered or failed.");
  try {
    await moveSellerRiderJob(user.id, id, parsed.data.to, parsed.data.reason);
    return ok({ moved: true });
  } catch (error) {
    if (error instanceof FleetError) return apiError("CONFLICT", error.message, 409);
    throw error;
  }
});
