import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { sellerStore } from "@/lib/inbox/auth";
import { disconnectSocialAccount } from "@/lib/social/publish.server";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social/schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stop publishing to a Facebook Page or Instagram account: its saved Page token is deleted.
export const DELETE = withSeller(async (_req, { user, params }) => {
  const platform = String(params.platform ?? "");
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(platform)) return apiError("NOT_FOUND", "Unknown account", 404);
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  await disconnectSocialAccount(store.id, platform as SocialPlatform);
  return ok({ disconnected: true });
});
