import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { BundleSaveError, BundleSaveSchema, saveBundle, sellerBundles } from "@/lib/products/bundles.server";

// One bundle (shared/bundles.ts): GET it with its items, PATCH it with the same body as POST
// /api/store/products/bundles (the whole bundle each time).

export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const [bundle] = await sellerBundles(store.id, params.id);
  if (!bundle) return apiError("NOT_FOUND", "Bundle not found", 404);
  return ok(bundle);
});

export const PATCH = withSeller(async (req: NextRequest, { user, params }: { user: AuthUser; params: { id: string } }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, userId: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BundleSaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  try {
    return ok(await saveBundle(store, parsed.data, params.id));
  } catch (error) {
    if (error instanceof BundleSaveError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
