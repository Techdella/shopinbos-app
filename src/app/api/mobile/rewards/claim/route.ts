import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api/response";
import { claimChallenge } from "@/lib/rewards/rewards.server";
import { rewardsErrorResponse, withRewardsUser } from "../_shared";

export const dynamic = "force-dynamic";

const Body = z.object({ key: z.string().trim().min(1).max(80) });

// POST /api/mobile/rewards/claim { key }: claims a finished challenge this week; answers with the Rewards screen.
export const POST = withRewardsUser(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say which challenge to claim.");
  try {
    return ok(await claimChallenge(user.id, parsed.data.key));
  } catch (error) {
    return rewardsErrorResponse(error, "claim");
  }
});
