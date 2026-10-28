import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { MINE_MAX, mySupplierProducts, overQuickLimit, removeSupplierProducts, repriceSupplierProducts } from "@/lib/marketplace/quick-add.server";

export const dynamic = "force-dynamic";

// My supplier products: the supplier products in the shop, to change the price of many at once or remove them.
//   GET → { products: [{ id, supplierProductId, name, image, status, dropship, supplierName, price, cost, lowest,
//                        stock, unavailable }], markup, asked }
//   POST { action: "reprice", ids, markup: { kind, value } }   → cost + markup, rounded to nice prices (saved as
//                                                                 the seller's markup too)
//   POST { action: "reprice", ids, suggested: true }           → the supplier's suggested prices
//   POST { action: "remove", ids }                             → archived like any removed product
//   Reprice → { updated: [{ id, price }], skipped: [{ id, name, message }] } (below the supplier's lowest price,
//   or a loss on the seller's own delivery choice); remove → { removed }.

const Ids = z.array(z.string().min(1).max(64)).min(1).max(MINE_MAX);
const Markup = z.object({ kind: z.enum(["percent", "amount"]), value: z.number().positive().max(5_000_000) });
const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reprice"), ids: Ids, markup: Markup.optional(), suggested: z.literal(true).optional() }),
  z.object({ action: z.literal("remove"), ids: Ids }),
]);

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const found = await mySupplierProducts(user.id);
  if (!found) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(found);
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick the products first.");
  if (await overQuickLimit(user.id, "mine")) return apiError("RATE_LIMITED", "Wait a few minutes and try again.", 429);
  if (parsed.data.action === "remove") {
    const removed = await removeSupplierProducts(user.id, parsed.data.ids);
    return removed ? ok(removed) : apiError("NOT_FOUND", "Set up your store first.", 404);
  }
  const { markup, suggested } = parsed.data;
  if (!markup && !suggested) return apiError("BAD_REQUEST", "Pick a markup or the supplier's prices.");
  const result = await repriceSupplierProducts(user.id, parsed.data.ids, markup ? { mode: "markup", markup } : { mode: "suggested" });
  if (!result) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(result);
});
