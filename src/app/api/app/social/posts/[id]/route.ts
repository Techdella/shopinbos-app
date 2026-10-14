import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { cancelPost } from "@/lib/social/publish.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cancel a scheduled post (only before it starts publishing).
export const DELETE = withSeller(async (_req, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const canceled = await cancelPost(store.id, String(params.id ?? ""));
  return canceled ? ok({ canceled: true }) : apiError("CONFLICT", "This post is already going out or was canceled.", 409);
});
