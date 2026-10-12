import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { parseTicketNumber } from "@/lib/support/pure";
import { getMyTicket } from "@/lib/support/service.server";
import { SUPPORT_ROLES, supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/support/tickets/1042 (or SB-1042): one of my conversations with the team. Opening it marks the
// team's replies read. The chat polls this while it's open.
export const GET = withAuth(async (_req, { user, params }) => {
  try {
    const number = parseTicketNumber(params.number);
    if (!number) return apiError("NOT_FOUND", "We couldn't find that conversation.", 404);
    const response = ok(await getMyTicket(user, number, { markRead: true }));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return supportError(error);
  }
}, [...SUPPORT_ROLES]);
