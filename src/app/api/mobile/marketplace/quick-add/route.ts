import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { QUICK_ADD_MAX } from "@/lib/marketplace/quick-add-core";
import { overQuickLimit, quickAddForSeller } from "@/lib/marketplace/quick-add.server";

export const dynamic = "force-dynamic";

// One-tap and bulk "Add to my shop" from Find products (src/lib/marketplace/quick-add.server.ts).
//   POST { ids: string[] (1–60, supplier product ids), markup?: { kind: "percent"|"amount", value } }
//     → { added: [{ supplierProductId, storeProductId, name, retailPrice, basis: "suggested"|"markup"|"lowest" }],
//         already: [{ supplierProductId, storeProductId, name }],
//         skipped: [{ supplierProductId, name, code, message, supplierId, supplierName }],
//         left: number | null, markup }
//   Each is a draft at the supplier's suggested price, else cost + the seller's markup (rounded to a nice price),
//   never below the supplier's lowest price. Safe to send again: what's already in the shop comes back in `already`.
//   A `markup` sent with it is saved as the seller's markup first (the question asked on their first add).
//   Skip codes: NOT_AVAILABLE, OUT_OF_STOCK, NOT_VERIFIED, PRICE_PROBLEM, PLAN_LIMIT, AGREEMENT_NEEDED,
//   AGREEMENT_WAITING, AGREEMENT_DECLINED, TOO_FAR, NO_PLACE, PAUSED, NOT_PAYABLE. Plan lines carry no upgrade prompt.

const Schema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(QUICK_ADD_MAX),
  markup: z.object({ kind: z.enum(["percent", "amount"]), value: z.number().positive().max(5_000_000) }).optional(),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", `Pick between 1 and ${QUICK_ADD_MAX} products.`);
  if (await overQuickLimit(user.id, "add")) return apiError("RATE_LIMITED", "That's a lot of adding. Wait a few minutes and try again.", 429);
  const result = await quickAddForSeller(user.id, parsed.data.ids, parsed.data.markup);
  if (!result) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(result, result.added.length ? 201 : 200);
});
