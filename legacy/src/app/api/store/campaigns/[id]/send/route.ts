import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";

export const POST = withSeller(async (
  req: NextRequest,
  { user, params }: { user: AuthUser; params: { id: string } }
) => {
  const store = await db.store.findUnique({ where: { userId: user.id } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);

  const campaign = await db.broadcastCampaign.findUnique({
    where: { id: params.id, storeId: store.id },
  });
  if (!campaign) return apiError("NOT_FOUND", "Campaign not found", 404);

  if (campaign.status === "sent") {
    return apiError("CONFLICT", "Campaign has already been sent");
  }

  const updated = await db.broadcastCampaign.update({
    where: { id: params.id },
    data: {
      status: "sent",
      sentAt: new Date(),
      sentCount: { increment: 1 },
    },
  });

  return ok(updated);
});
