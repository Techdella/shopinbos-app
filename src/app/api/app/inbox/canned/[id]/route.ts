import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { sellerStore } from "@/lib/inbox/auth";

export const dynamic = "force-dynamic";

export const DELETE = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const { count } = await db.inboxCannedReply.deleteMany({ where: { id: String(params.id), storeId: store.id } });
  if (!count) return apiError("NOT_FOUND", "Saved reply not found", 404);
  return ok({ deleted: true });
});
