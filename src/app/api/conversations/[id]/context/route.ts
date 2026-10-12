import { withAuth } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { contextOptions } from "@/lib/conversations/service.server";
import { MESSAGING_ROLES, conversationError } from "@/lib/conversations/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Products, orders and deliveries the viewer can link in this chat (the composer's "Link" menu).
export const GET = withAuth(async (_req, { user, params }) => {
  try {
    return ok(await contextOptions(user, String(params.id)));
  } catch (error) {
    return conversationError(error);
  }
}, [...MESSAGING_ROLES]);
