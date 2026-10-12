import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { bulkUpdateSchema } from "@/lib/support/pure";
import { bulkUpdate } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/support/tickets/bulk: { ids, status?, priority?, assigneeId? ("me", an admin id or null) }.
export const POST = withAdmin(async (req: NextRequest, { user }) => {
  try {
    const parsed = bulkUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("BAD_REQUEST", "Pick some tickets and a change.");
    if (parsed.data.status === undefined && parsed.data.priority === undefined && parsed.data.assigneeId === undefined) {
      return apiError("BAD_REQUEST", "Pick a change to make.");
    }
    return ok(await bulkUpdate(user, parsed.data));
  } catch (error) {
    return supportError(error);
  }
});
