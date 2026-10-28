import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { starterPacksFor } from "@/lib/marketplace/quick-add.server";

export const dynamic = "force-dynamic";

// Starter packs for a new shop (shared/starter-packs.ts), worked out from the supplier products near the seller:
// top-rated, in stock, verified suppliers, not already in the shop.
//   GET → { packs: [{ id, title, icon, size, count, totalCost, totalPrice, readyCount,
//                     needsAgreement: [{ id, name }],
//                     items: [{ id, name, image, category, supplierName, cost, price, ready, dropship }] }],
//           markup, asked }
//   "Add all" sends the pack's item ids to POST /api/mobile/marketplace/quick-add.

export const GET = withSeller(async (_req: NextRequest, { user }) => {
  const found = await starterPacksFor(user.id);
  if (!found) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(found);
});
