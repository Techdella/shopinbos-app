import { withAdmin } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { supportQueue } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/support/tickets?status=active|open|pending|solved|closed|all&priority=&topic=&portal=
//     &assignee=me|none|<userId>&q=&page=: the support queue with counts per status.
export const GET = withAdmin(async (req, { user }) => {
  try {
    const params = req.nextUrl.searchParams;
    const queue = await supportQueue(user.id, {
      status: params.get("status") ?? undefined,
      priority: params.get("priority") ?? undefined,
      topic: params.get("topic") ?? undefined,
      portal: params.get("portal") ?? undefined,
      assignee: params.get("assignee") ?? undefined,
      q: params.get("q") ?? undefined,
      page: Number(params.get("page")) || 1,
    });
    return ok(queue);
  } catch (error) {
    return supportError(error);
  }
});
