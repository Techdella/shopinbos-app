import { ok } from "@/lib/api/response";
import { swapPoints } from "@/lib/rewards/rewards.server";
import { rewardsErrorResponse, withRewardsUser } from "../_shared";

export const dynamic = "force-dynamic";

// POST /api/mobile/rewards/swap: 100 points become 20 free AI credits (never cash). { rewards, creditsAdded }.
export const POST = withRewardsUser(async (_req, { user }) => {
  try {
    return ok(await swapPoints(user.id));
  } catch (error) {
    return rewardsErrorResponse(error, "swap");
  }
});
