import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { planFor } from "@/lib/ai/rex/full-build.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ai/build-store/plan: what a full and a quick build would do with the seller's free allowance and
// AI credits today, for Rex Studio's build setup. Nothing is spent here.
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const [full, quick] = await Promise.all([planFor(user.id, "full"), planFor(user.id, "quick")]);
  return NextResponse.json({
    data: { full: full.plan, quick: quick.plan, balance: full.budget.balance, costs: full.budget.costs, left: full.budget.left, imagesOn: full.imagesOn },
  });
});
