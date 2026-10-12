import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { parseTicketNumber, ticketUpdateSchema } from "@/lib/support/pure";
import { getTicketForAgent, updateTicket } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   /api/admin/support/tickets/1042: the full thread (with internal notes), customer context and admins.
// PATCH /api/admin/support/tickets/<ticket id>: { status?, priority?, topic?, assigneeId? }.
export const GET = withAdmin(async (_req, { user, params }) => {
  try {
    const number = parseTicketNumber(params.id);
    const ticket = number ? await getTicketForAgent(number, user.id) : null;
    if (!ticket) return apiError("NOT_FOUND", "Ticket not found.", 404);
    return ok(ticket);
  } catch (error) {
    return supportError(error);
  }
});

export const PATCH = withAdmin(async (req: NextRequest, { user, params }) => {
  try {
    const parsed = ticketUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Nothing to change.");
    return ok(await updateTicket(user, String(params.id), parsed.data));
  } catch (error) {
    return supportError(error);
  }
});
