import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { sendCampaign } from "@/lib/campaigns/send";
import type { AuthUser } from "@/lib/auth/types";

export const maxDuration = 300;

export const POST = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const result = await sendCampaign(store.id, params.id);
  if (!result.ok) {
    const status = result.error === "Campaign not found" ? 404 : result.error.startsWith("This campaign") ? 409 : 400;
    return apiError(status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "BAD_REQUEST", result.error, status);
  }
  return ok({ sent: result.sent, failed: result.failed });
});
