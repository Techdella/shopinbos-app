import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { hasAiProvider } from "@/lib/inbox/ai";
import { sellerStore } from "@/lib/inbox/auth";

export const dynamic = "force-dynamic";

// The away message (InboxSettings) for the mobile app's Auto-replies screen. The web page reads it on the
// server; saving goes through PUT /api/app/inbox/settings, and the rules through /api/app/inbox/automation.
export const GET = withSeller(async (_req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const settings = await db.inboxSettings.findUnique({ where: { storeId: store.id } });
  return ok({
    autoReplyEnabled: settings?.autoReplyEnabled ?? false,
    autoReplyMode: settings?.autoReplyMode === "peggy" ? "peggy" : "message",
    awayMessage: settings?.awayMessage ?? "",
    aiAvailable: hasAiProvider(),
  });
});
