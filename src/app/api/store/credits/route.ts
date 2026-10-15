import { NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { creditBalance } from "@/lib/ai/credits.server";

// The seller's spendable AI credits (same number as /home/credits and Settings > Billing).
export const GET = withSeller(async (_req, { user }) => {
  return NextResponse.json({ credits: await creditBalance(user.id) });
});
