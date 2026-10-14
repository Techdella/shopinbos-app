import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { CreditError, creditOverview, forgetCreditCard, setAutoTopUp } from "@/lib/ai/credits.server";
import { CREDIT_COST, CREDIT_PACKS } from "@shared/ai-credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI credits: GET the balance, packs and auto top-up; PATCH { autoTopUp, packId } to change auto top-up;
// DELETE removes the saved card. Buying is POST /api/app/credits/checkout.

export const GET = withAuth(async (_req: NextRequest, { user }) => ok({ ...(await creditOverview(user.id)), packs: CREDIT_PACKS, costs: CREDIT_COST }));

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { autoTopUp?: unknown; packId?: unknown };
  if (typeof body.autoTopUp !== "boolean") return apiError("BAD_REQUEST", "Say whether auto top-up is on or off.");
  try {
    await setAutoTopUp(user.id, { enabled: body.autoTopUp, packId: typeof body.packId === "string" ? body.packId : undefined });
    return ok(await creditOverview(user.id));
  } catch (error) {
    if (error instanceof CreditError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { user }) => {
  await forgetCreditCard(user.id);
  return ok(await creditOverview(user.id));
});
