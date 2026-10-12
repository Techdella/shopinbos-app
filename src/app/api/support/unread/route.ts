import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { unreadCount } from "@/lib/support/service.server";
import { SUPPORT_ROLES, supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/support/unread: support replies I haven't opened yet, for the help button's badge. Polled.
export const GET = withAuth(async (_req, { user }) => {
  try {
    const response = ok({ unread: await unreadCount(user) });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return supportError(error);
  }
}, [...SUPPORT_ROLES]);
