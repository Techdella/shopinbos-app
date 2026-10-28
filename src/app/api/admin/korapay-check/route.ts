import { withAdmin } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { runKorapayCheck } from "@/lib/kyb/korapay-check.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/korapay-check: one real Korapay Identity CAC lookup and the key's balance, for Admin › Developers
// (src/lib/kyb/korapay-check.server.ts). A POST, so a page load never spends a lookup.
export const POST = withAdmin(async () => ok(await runKorapayCheck()));
