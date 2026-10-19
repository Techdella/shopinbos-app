import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { PackagingRequestUpdateSchema } from "@shared/packaging-requests";

export const dynamic = "force-dynamic";

// /admin/packaging-requests: move a request along (quoted, in progress, done) and keep notes the seller doesn't see.
export const PATCH = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const parsed = PackagingRequestUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Check the status.");
  const row = await db.packagingRequest.findUnique({ where: { id }, select: { id: true } });
  if (!row) return apiError("NOT_FOUND", "Request not found", 404);
  return ok(await db.packagingRequest.update({ where: { id }, data: parsed.data }));
});
