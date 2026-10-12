import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { macroSchema } from "@/lib/support/pure";
import { listMacros, saveMacro } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/admin/support/macros: the team's saved replies, most used first.
// POST /api/admin/support/macros: { title, body, topic?, status? }.
export const GET = withAdmin(async () => {
  try {
    return ok(await listMacros());
  } catch (error) {
    return supportError(error);
  }
});

export const POST = withAdmin(async (req: NextRequest, { user }) => {
  try {
    const parsed = macroSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the saved reply.");
    return ok(await saveMacro(user, null, parsed.data), 201);
  } catch (error) {
    return supportError(error);
  }
});
