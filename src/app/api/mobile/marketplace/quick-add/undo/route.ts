import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { overQuickLimit, undoQuickAdd } from "@/lib/marketplace/quick-add.server";

export const dynamic = "force-dynamic";

// "Undo" on the toast after a one-tap or bulk add: POST { storeProductIds: string[] (1–200) } → { removed }.
// Only drafts linked to a supplier product and added in the last 30 minutes come out; anything else stays.

const Schema = z.object({ storeProductIds: z.array(z.string().min(1).max(64)).min(1).max(200) });

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Nothing to undo.");
  if (await overQuickLimit(user.id, "undo")) return apiError("RATE_LIMITED", "Wait a few minutes and try again.", 429);
  const result = await undoQuickAdd(user.id, parsed.data.storeProductIds);
  if (!result) return apiError("NOT_FOUND", "Set up your store first.", 404);
  return ok(result);
});
