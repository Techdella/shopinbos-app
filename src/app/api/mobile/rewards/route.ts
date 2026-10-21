import { ok } from "@/lib/api/response";
import { rewardsFor } from "@/lib/rewards/rewards.server";
import { rewardsErrorResponse, withRewardsUser } from "./_shared";

export const dynamic = "force-dynamic";

// GET /api/mobile/rewards: level, XP, points, streak, this week's challenges, badges and the points → credits swap.
export const GET = withRewardsUser(async (_req, { user }) => {
  try {
    return ok(await rewardsFor(user.id));
  } catch (error) {
    return rewardsErrorResponse(error, "GET");
  }
});
