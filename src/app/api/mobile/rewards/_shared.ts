import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { RewardsError } from "@/lib/rewards/rewards.server";

// Rewards in the phone app: sellers, suppliers and delivery partners (src/lib/rewards).
export const withRewardsUser: typeof withAuth = (handler) => withAuth(handler, ["seller", "supplier", "logistics_partner"]);

export function rewardsErrorResponse(error: unknown, tag: string): NextResponse {
  if (error instanceof RewardsError) return apiError(error.code, error.message, error.status);
  console.error(`[rewards] ${tag}`, error);
  return apiError("INTERNAL_ERROR", "We couldn't load your rewards. Try again in a moment.", 500);
}
