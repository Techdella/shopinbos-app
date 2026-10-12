import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, noContent, ok } from "@/lib/api/response";
import { macroSchema } from "@/lib/support/pure";
import { deleteMacro, saveMacro } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH  /api/admin/support/macros/<id>: { title, body, topic?, status? }.
// DELETE /api/admin/support/macros/<id>.
export const PATCH = withAdmin(async (req: NextRequest, { user, params }) => {
  try {
    const parsed = macroSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the saved reply.");
    return ok(await saveMacro(user, String(params.id), parsed.data));
  } catch (error) {
    return supportError(error);
  }
});

export const DELETE = withAdmin(async (_req, { params }) => {
  try {
    await deleteMacro(String(params.id));
    return noContent();
  } catch (error) {
    return supportError(error);
  }
});
