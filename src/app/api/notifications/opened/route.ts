import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { recordOpen } from "@/lib/push-campaigns/campaigns.server";

// POST /api/notifications/opened { notificationId } — the person tapped a push (the phone app's tap handler and the
// browser's service worker, public/sw-push.js). Only counts for Push center campaigns (their "opened" number);
// anything else is a no-op. Marking it read is still PATCH /api/notifications.
const Body = z.object({ notificationId: z.string().min(1).max(64) });

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "notificationId is required");
  return ok({ counted: await recordOpen(user.id, parsed.data.notificationId) });
});
