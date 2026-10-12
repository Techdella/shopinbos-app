import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseTicketNumber, replySchema } from "@/lib/support/pure";
import { addUserMessage, filesProblem } from "@/lib/support/service.server";
import { SUPPORT_ROLES, readBody, supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/support/tickets/1042/messages: my reply (JSON or multipart: message, file(s)?). Reopens a solved
// conversation. Returns the updated thread.
export const POST = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    if (!checkRateLimit(`support-reply:${user.id}`, { maxRequests: 30, windowMs: 60_000 }).allowed) {
      return apiError("RATE_LIMITED", "You're sending messages very fast. Wait a moment and try again.", 429);
    }
    const number = parseTicketNumber(params.number);
    if (!number) return apiError("NOT_FOUND", "We couldn't find that conversation.", 404);
    const body = await readBody(req);
    const parsed = replySchema.safeParse(body?.fields ?? null);
    if (!body || !parsed.success) return apiError("BAD_REQUEST", "Type a message or attach a file.");
    const problem = filesProblem(body.files);
    if (problem) return apiError("BAD_REQUEST", problem);
    return ok(await addUserMessage(user, number, parsed.data.message, body.files), 201);
  } catch (error) {
    return supportError(error);
  }
}, [...SUPPORT_ROLES]);
