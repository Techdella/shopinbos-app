import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { RexBuildError, saveCategories } from "@/lib/onboarding/rex-build.server";

export const dynamic = "force-dynamic";

// PUT /api/mobile/onboarding/categories { groups: [{ name, productIds }] } → { collections }
// "I sorted them into 3 categories. Look right?" (design RB-04): the categories the seller confirmed (Rex's sort from
// GET /api/mobile/onboarding, renamed or added to) become the shop's collections, each with its products. Only the
// seller's own products are linked.
const Body = z.object({
  groups: z.array(z.object({ name: z.string().trim().min(1, "Give each category a name.").max(80), productIds: z.array(z.string().max(60)).max(200) })).min(1).max(12),
});

export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the categories.", 400);
  try {
    return ok({ collections: await saveCategories(user.id, parsed.data.groups) });
  } catch (error) {
    if (error instanceof RexBuildError) return apiError(error.code, error.message, error.status);
    throw error;
  }
});
