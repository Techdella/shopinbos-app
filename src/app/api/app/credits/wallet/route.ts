import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { CreditError, buyCreditsFromWallet } from "@/lib/ai/credits.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/app/credits/wallet { packId }: buy a credit pack from the prepaid wallet balance.
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { packId?: unknown };
  try {
    return ok(await buyCreditsFromWallet(user.id, typeof body.packId === "string" ? body.packId : ""));
  } catch (error) {
    if (error instanceof CreditError) return apiError("BAD_REQUEST", error.message);
    console.error("[credits] wallet purchase failed", error);
    return apiError("UNAVAILABLE", "Couldn't buy the credits. Try again.", 503);
  }
}, ["seller", "supplier", "logistics_partner"]);
