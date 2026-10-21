import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { unlockedTiers } from "@/lib/theme-access";
import { loadSellerThemeAccess } from "@/lib/theme-access.server";
import { themePrices } from "@/lib/themes/purchase.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the seller may use, for the theme gallery's badges and its Buy and Upgrade buttons.
// GET → { tier: "basic" | "premium" | "platinum", unlocked: ThemeTier[], owned: string[], prices: { premium, platinum } }

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const [access, prices] = await Promise.all([loadSellerThemeAccess(user.id), themePrices()]);
  return ok({ tier: access.tier, unlocked: unlockedTiers(access.tier), owned: access.owned, prices });
});
