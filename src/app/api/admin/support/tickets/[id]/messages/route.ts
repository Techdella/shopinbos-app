import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { agentReplySchema } from "@/lib/support/pure";
import { agentReply, filesProblem } from "@/lib/support/service.server";
import { readBody, supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/support/tickets/<ticket id>/messages: a reply (shown in-app and emailed, or texted when we
// only have a phone) or an internal note. JSON or multipart: message, internal, status?, macroId?, file(s)?.
export const POST = withAdmin(async (req: NextRequest, { user, params }) => {
  try {
    const body = await readBody(req);
    const fields = body?.fields ?? {};
    const parsed = agentReplySchema.safeParse({ ...fields, internal: fields.internal === true || fields.internal === "true", asPeggy: fields.asPeggy === true || fields.asPeggy === "true", status: fields.status || undefined, macroId: fields.macroId || undefined });
    if (!body || !parsed.success) return apiError("BAD_REQUEST", "Write a reply or attach a file.");
    const problem = filesProblem(body.files);
    if (problem) return apiError("BAD_REQUEST", problem);
    return ok(await agentReply(user, String(params.id), { ...parsed.data, files: body.files }), 201);
  } catch (error) {
    return supportError(error);
  }
});
