import { withSupplier } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { ExtraError, useIncludedFeaturedWeek } from "@/lib/plans/extras.server";

export const dynamic = "force-dynamic";

// Supplier Pro: start one of this month's included featured weeks.
export const POST = withSupplier(async (_req, { user }) => {
  try {
    const row = await useIncludedFeaturedWeek(user.id);
    return ok({ startsAt: row.startsAt, endsAt: row.endsAt });
  } catch (error) {
    if (error instanceof ExtraError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
