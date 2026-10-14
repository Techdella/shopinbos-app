import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { runAiCheck } from "@/lib/ai/check.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/admin/ai-check: { images?: boolean }. Makes one small real call per AI job (Rex and Peggy on Claude
// and on OpenAI, quick writing, optionally one test picture) and reports which work. See src/lib/ai/check.server.ts.
export const POST = withAdmin(async (req: NextRequest) => {
  const body = (await req.json().catch(() => null)) as { images?: unknown } | null;
  return ok(await runAiCheck({ images: body?.images === true }));
});
