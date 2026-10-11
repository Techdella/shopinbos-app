import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { listInbox } from "@/lib/inbox/queries";
import { touchSellerSeen } from "@/lib/inbox/service";

export const dynamic = "force-dynamic";

// The unified inbox list (customer conversations on every channel + supplier/partner chats).
// The inbox polls this, which also marks the seller as online for live chat and away auto-replies.
export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  await touchSellerSeen(store.id);
  return ok(await listInbox(store.id, user.id));
});
