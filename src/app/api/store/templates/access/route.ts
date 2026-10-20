import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { unlockedTiers } from "@/lib/theme-access";
import { loadSellerThemeTier } from "@/lib/theme-access.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The theme tiers the seller's plan includes, for the theme gallery's badges and Upgrade buttons.
// GET → { tier: "basic" | "premium" | "platinum", unlocked: ThemeTier[] }

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const tier = await loadSellerThemeTier(user.id);
  return ok({ tier, unlocked: unlockedTiers(tier) });
});
