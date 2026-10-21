import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { jobView } from "@/lib/create/jobs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One Create with Rex job (own jobs only) → { job }. The app polls this until status is "done" or "failed".
export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const id = String(params.id ?? "");
  const row = await db.createJob.findFirst({ where: { id, userId: user.id } });
  if (!row) return apiError("NOT_FOUND", "That design job wasn't found.", 404);
  return ok({ job: jobView(row) });
}, ["seller", "supplier", "logistics_partner"]);
