import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { channelViews, platformReadiness } from "@/lib/inbox/connect";

export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok({ channels: await channelViews(store.id), platform: platformReadiness() });
});
