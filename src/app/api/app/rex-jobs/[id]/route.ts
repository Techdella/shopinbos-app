import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { rexJobView } from "@shared/rex-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One Rex job (shared/rex-jobs.ts), for polling a pending one: { data: RexJobView }. Only the owner's.
export const GET = withAuth(async (_req: NextRequest, { user, params }) => {
  const id = String(params.id ?? "");
  const row = await db.rexJob.findFirst({ where: { id, userId: user.id } }).catch(() => null);
  if (!row) return apiError("NOT_FOUND", "That Rex job isn't here.", 404);
  return ok(rexJobView(row));
}, ["seller", "supplier", "logistics_partner"]);
