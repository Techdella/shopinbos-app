import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { createPackagingRequest } from "@/lib/packaging/requests.server";
import { PackagingRequestSchema } from "@shared/packaging-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Make my packaging for me": GET the store's requests; POST sends one to the Shopinbos team.
export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(await db.packagingRequest.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 30 }));
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const parsed = PackagingRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your details.");
  const row = await createPackagingRequest({ storeId: store.id, userId: user.id, email: user.email ?? null, request: parsed.data });
  return ok({ id: row.id, status: row.status });
});
