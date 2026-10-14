import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { parseReviewKey, REVIEW_STATUSES } from "@/lib/reviews/pure";
import { loadReview, moderateReview } from "@/lib/reviews/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/app/reviews/<key> { status } or { featured } → { data: review }: Publish, Move to waiting, Hide,
// Feature and Unfeature, the same as the web review page's actions (src/app/actions/reviews.ts). Featuring also
// publishes (src/lib/reviews/pure.ts reviewModerationData).

const Body = z.union([z.object({ status: z.enum(REVIEW_STATUSES) }).strict(), z.object({ featured: z.boolean() }).strict()]);

export const PATCH = withSeller(async (req: NextRequest, { user, params }) => {
  const key = decodeURIComponent(String(params.key ?? ""));
  const ref = parseReviewKey(key);
  if (!ref) return apiError("NOT_FOUND", "Review not found.", 404);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Choose publish, wait, hide or feature.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  if (!(await moderateReview(store.id, ref, parsed.data))) return apiError("NOT_FOUND", "Review not found.", 404);
  revalidatePath("/home/reviews", "layout");
  const item = await loadReview(store.id, ref.kind, ref.id);
  return item ? ok(item) : apiError("NOT_FOUND", "Review not found.", 404);
});
