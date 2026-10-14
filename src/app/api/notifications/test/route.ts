import { withAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/notify.server";

// "Send me a test notification": one notification through the normal path (bell, then push to every phone and
// browser that has notifications on). Ignores quiet hours so people can check it any time.
export const POST = withAuth(async (_req, { user }) => {
  const limit = await checkRateLimitShared(rateLimitKey("notify-test", user.id), { maxRequests: 5, windowMs: 10 * 60_000 });
  if (!limit.allowed) return apiError("RATE_LIMITED", "You've sent a few tests already. Try again in a few minutes.", 429);
  const devices = await db.pushDevice.count({ where: { userId: user.id, disabledAt: null } }).catch(() => 0);
  await notify({
    userId: user.id,
    event: "test",
    type: "system",
    priority: "success",
    title: "Notifications are working",
    description: devices ? "This is a test. You'll get alerts like this for new orders, payments and messages." : "This is a test. Turn on notifications on your phone or browser to get alerts even when Shopinbos is closed.",
    link: "/home/notifications",
    dedupeKey: false,
  });
  return ok({ sent: true, devices });
});
