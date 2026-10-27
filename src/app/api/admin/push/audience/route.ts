import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAdmin } from "@/lib/auth/middleware";
import { parseAudience } from "@shared/push-campaigns";
import { estimateAudience } from "@/lib/push-campaigns/campaigns.server";
import { adminOf, pushError, readJson } from "@/lib/push-campaigns/api.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/push/audience { audience } — how many people and devices it would reach right now (people who
// switched Shopinbos news off get the bell only).
export const POST = withAdmin(async (req: NextRequest, { user }) => {
  const body = await readJson(req);
  if ("error" in body) return body.error;
  const parsed = parseAudience((body.data as { audience?: unknown } | null)?.audience);
  if ("error" in parsed) return apiError("VALIDATION_ERROR", parsed.error, 422);
  try {
    return NextResponse.json({ data: await estimateAudience(parsed.audience, await adminOf(user)) });
  } catch (error) {
    return pushError(error);
  }
});
