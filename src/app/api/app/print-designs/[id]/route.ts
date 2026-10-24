import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { deleteDesign, loadPackagingDesign } from "@/lib/packaging/designs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  if (!(await deleteDesign(store.id, id))) return apiError("NOT_FOUND", "That design isn't here any more.", 404);
  return ok({ id });
});

// One packaging design with its data (the phone app's Packaging screen opens a saved design to order prints).
export const GET = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const design = await loadPackagingDesign(store.id, id);
  if (!design) return apiError("NOT_FOUND", "That design isn't here any more.", 404);
  return ok(design);
});
