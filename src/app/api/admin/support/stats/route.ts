import { withAdmin } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { supportStats } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/support/stats: open/pending/overdue counts, solved and new today, median first response and
// CSAT over the last 30 days.
export const GET = withAdmin(async () => {
  try {
    return ok(await supportStats());
  } catch (error) {
    return supportError(error);
  }
});
