import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { FeatureSwitchesNotReady, adminFeatureData } from "@/lib/feature-switches.server";

export const dynamic = "force-dynamic";

// Admin › Pilot features as JSON (owners and admins: "features" is in no team section, src/lib/admin-team/pure.ts).
// Changes go through the page's server actions (src/app/actions/admin-features.ts), which log every one.
//   GET → { data: { killAll, switches, targets, areas, invites, log } }

export const GET = withAdmin(async () => {
  try {
    return ok(await adminFeatureData());
  } catch (error) {
    if (error instanceof FeatureSwitchesNotReady) return apiError("NOT_READY", error.message, 503);
    throw error;
  }
});
