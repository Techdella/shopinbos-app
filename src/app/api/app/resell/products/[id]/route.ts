import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { getProductResell, saveProductResell } from "@/lib/resell/service.server";
import { resellFailure, resellOff, resellOnForRequest } from "@/lib/resell/route-helpers.server";
import { RESELL_PCT_MAX, RESELL_PCT_MIN, cleanResellPct } from "@shared/resell";

export const dynamic = "force-dynamic";

// The shop's "Let resellers sell this" for one of its products (pilot "resell", shared/resell.ts).
//   GET → { data: { enabled, commissionPct, links } }
//   PUT { enabled: boolean, commissionPct: number (1–50) } → the same
// 404 when resell isn't on for this account on this app, or the product isn't the shop's.

async function ownProduct(userId: string, productId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) return null;
  const product = await db.storeProduct.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true } });
  return product ? { storeId: store.id, productId: product.id } : null;
}

const SaveSchema = z.object({ enabled: z.boolean(), commissionPct: z.union([z.number(), z.string()]) });

export const GET = withSeller(async (req, { user, params }) => {
  if (!(await resellOnForRequest(req, user.id))) return resellOff();
  const own = await ownProduct(user.id, String(params.id ?? ""));
  if (!own) return apiError("NOT_FOUND", "Product not found", 404);
  try {
    return ok(await getProductResell(own.storeId, own.productId));
  } catch (error) {
    return resellFailure(error);
  }
});

export const PUT = withSeller(async (req, { user, params }) => {
  if (!(await resellOnForRequest(req, user.id))) return resellOff();
  const own = await ownProduct(user.id, String(params.id ?? ""));
  if (!own) return apiError("NOT_FOUND", "Product not found", 404);
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say whether resellers may sell it, and the commission");
  const commissionPct = cleanResellPct(parsed.data.commissionPct);
  if (commissionPct === null) return apiError("BAD_REQUEST", `The commission must be between ${RESELL_PCT_MIN}% and ${RESELL_PCT_MAX}%`);
  try {
    return ok(await saveProductResell(own.storeId, own.productId, { enabled: parsed.data.enabled, commissionPct }));
  } catch (error) {
    return resellFailure(error);
  }
});
