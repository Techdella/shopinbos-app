import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError } from "@/lib/api/response";
import { aiConfigured } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";
import { draftReviewReply } from "@/lib/reviews/ai";
import { parseReviewKey } from "@/lib/reviews/pure";
import { loadReview } from "@/lib/reviews/server";

export const dynamic = "force-dynamic";

// POST { key } → { data: { reply } }: Peggy drafts a reply for the seller to edit. Nothing is posted.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = await req.json().catch(() => null);
  const ref = parseReviewKey(String(body?.key ?? ""));
  if (!ref) return apiError("BAD_REQUEST", "Review not found");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const item = await loadReview(store.id, ref.kind, ref.id);
  if (!item) return apiError("NOT_FOUND", "Review not found", 404);
  if (!aiConfigured()) return apiError("NOT_CONFIGURED", "Peggy needs OPENAI_API_KEY or ANTHROPIC_API_KEY to draft replies.", 503);
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;
  const product = item.productId ? await db.storeProduct.findFirst({ where: { id: item.productId, storeId: store.id }, select: { name: true } }) : null;
  const reply = await draftReviewReply(item, store.name, product?.name);
  if (!reply) return apiError("AI_UNAVAILABLE", "Peggy couldn't draft a reply just now. Try again.", 502);
  return NextResponse.json({ data: { reply } });
});
