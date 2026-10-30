import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import type { AuthUser } from "@/lib/auth/types";
import { productLimitProblem } from "@/lib/plans/gates.server";
import { BundleSaveError, BundleSaveSchema, bundleChoices, saveBundle, sellerBundles } from "@/lib/products/bundles.server";

// Bundles ("Buy together", shared/bundles.ts) for the web's /products/bundles and the phone's "Make a bundle":
//   GET  → { bundles, choices }: the store's bundles and the products a bundle can hold
//   POST { name, price, items: [{ productId, quantity }], image?, description?, publish? } → the new bundle
// Changing one: PATCH /api/store/products/bundles/[id]; removing one archives it like any product (DELETE
// /api/store/products/[id]).

export const dynamic = "force-dynamic";

export const GET = withSeller(async (_req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const [bundles, choices] = await Promise.all([sellerBundles(store.id), bundleChoices(store.id)]);
  return ok({ bundles, choices });
});

export const POST = withSeller(async (req: NextRequest, { user }: { user: AuthUser }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, userId: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BundleSaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid input");
  // A bundle is a product, so it counts toward the plan's product limit.
  const planLimit = await productLimitProblem(user.id, store.id);
  if (planLimit) return apiError("PLAN_LIMIT", planLimit, 402);
  try {
    return ok(await saveBundle(store, parsed.data), 201);
  } catch (error) {
    if (error instanceof BundleSaveError) return apiError("BAD_REQUEST", error.message);
    throw error;
  }
});
