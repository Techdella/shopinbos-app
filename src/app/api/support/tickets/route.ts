import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { createTicketSchema } from "@/lib/support/pure";
import { createTicket, filesProblem, listMyTickets, supportReady, unreadCount } from "@/lib/support/service.server";
import { SUPPORT_ROLES, readBody, supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/support/tickets: my support conversations (newest activity first) and the unread count.
// POST /api/support/tickets: "Talk to a person" (JSON or multipart: topic, message, subject?, path?,
//      transcript? (the Peggy chat so far), file(s)?). Opens a ticket and returns its thread.
export const GET = withAuth(async (_req, { user }) => {
  try {
    const [tickets, unread, ready] = await Promise.all([listMyTickets(user), unreadCount(user), supportReady()]);
    return ok({ tickets, unread, ready, role: user.role });
  } catch (error) {
    return supportError(error);
  }
}, [...SUPPORT_ROLES]);

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    if (!(await checkRateLimitShared(rateLimitKey("support-ticket", user.id), { maxRequests: 8, windowMs: 3_600_000 })).allowed) {
      return apiError("RATE_LIMITED", "You've opened a few conversations already. Reply in one of those and we'll pick it up.", 429);
    }
    const body = await readBody(req);
    const parsed = createTicketSchema.safeParse(body?.fields ?? null);
    if (!body || !parsed.success) return apiError("BAD_REQUEST", parsed.error?.issues[0]?.message ?? "Type a message first.");
    const problem = filesProblem(body.files);
    if (problem) return apiError("BAD_REQUEST", problem);
    return ok(await createTicket(user, { ...parsed.data, files: body.files }), 201);
  } catch (error) {
    return supportError(error);
  }
}, [...SUPPORT_ROLES]);
