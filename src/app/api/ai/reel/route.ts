import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The video studio calls this just before it records a reel: a finished video comes out of the day's free
// videos, then costs credits (CREDIT_COST.video). A 402 AI_CREDITS_NEEDED means the seller buys credits first.
export const POST = withSeller(async (_req, { user }) => {
  const limited = await meterAi(user.id, "video");
  if (limited) return limited;
  return ok({ allowed: true });
});
