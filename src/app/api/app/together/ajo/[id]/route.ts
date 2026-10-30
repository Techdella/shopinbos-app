import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { featureOnForRequest, tablesMissing } from "@/lib/pay-together/common.server";
import { sellerAjoGroup } from "@/lib/pay-together/ajo.server";

export const dynamic = "force-dynamic";

// One ajo group for its seller (pilot "ajo"): members (in collection order), who paid each week, who to ship to this
// week, every contribution that landed (the settlement report) and the draw seed. GET → { data: … }.
export const GET = withSeller(async (req, { user, params }) => {
  if (!(await featureOnForRequest(req, user.id, "ajo"))) return apiError("NOT_FOUND", "Ajo isn't on for your shop.", 404);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  try {
    const group = await sellerAjoGroup(store.id, String(params.id ?? ""));
    return group ? ok(group) : apiError("NOT_FOUND", "Group not found", 404);
  } catch (error) {
    if (tablesMissing(error)) return apiError("NOT_READY", "Not ready yet. Try again later.", 503);
    throw error;
  }
});
