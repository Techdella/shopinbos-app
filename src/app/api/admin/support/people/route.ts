import { withAdmin } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { searchPeople, type PersonRole } from "@/lib/support/people.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set<PersonRole>(["seller", "supplier", "logistics_partner", "lead"]);

// GET /api/admin/support/people?q=&role=seller|supplier|logistics_partner|lead: who the team can message
// (Admin › Inbox › New conversation), up to 20.
export const GET = withAdmin(async (req) => {
  const params = req.nextUrl.searchParams;
  const role = params.get("role") as PersonRole | null;
  return ok(await searchPeople(params.get("q") ?? "", role && ROLES.has(role) ? role : null));
});
