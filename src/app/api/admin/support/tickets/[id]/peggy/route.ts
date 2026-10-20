import { NextRequest } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { peggyDraft } from "@/lib/support/peggy.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const bodySchema = z.object({ instruction: z.string().max(600).optional() });

// POST /api/admin/support/tickets/<ticket id>/peggy: { instruction? } → Peggy's draft reply
// { reply, needsHuman, note } for the team to read, edit and send. Nothing is sent from here.
export const POST = withAdmin(async (req: NextRequest, { params }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError("BAD_REQUEST", "Keep the instruction under 600 characters.");
  try {
    return ok(await peggyDraft(String(params.id), { instruction: parsed.data.instruction }));
  } catch (error) {
    return apiError("PEGGY_FAILED", error instanceof Error ? error.message : "Peggy couldn't write a reply just now.", 502);
  }
});
