import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { parseTicketNumber, ratingSchema } from "@/lib/support/pure";
import { rateTicket } from "@/lib/support/service.server";
import { SUPPORT_ROLES, supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/support/tickets/1042/rating: { rating: 1-5, comment? } once the conversation is solved.
export const POST = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const number = parseTicketNumber(params.number);
    if (!number) return apiError("NOT_FOUND", "We couldn't find that conversation.", 404);
    const parsed = ratingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("BAD_REQUEST", "Pick a rating from 1 to 5.");
    return ok(await rateTicket(user, number, parsed.data.rating, parsed.data.comment));
  } catch (error) {
    return supportError(error);
  }
}, [...SUPPORT_ROLES]);
