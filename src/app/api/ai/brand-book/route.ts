import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { BrandBookError, draftBrandBook, saveBrandBook } from "@/lib/ai/brand-book.server";

export const runtime = "nodejs";
// Up to two model calls (a retry when the first book comes back incomplete).
export const maxDuration = 300;

// Rex writes (or rewrites) the store's brand style book: POST { direction? }. Saved on the store; the colours are
// only applied to the store when the seller taps "Use these colours" on the style book page.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { direction?: string };
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const limited = await meterAi(user.id, "text", 2);
  if (limited) return limited;
  try {
    const book = await saveBrandBook(store.id, await draftBrandBook(store.id, typeof body.direction === "string" ? body.direction : null));
    return ok(book);
  } catch (error) {
    if (error instanceof BrandBookError) return apiError("UNAVAILABLE", error.message, 503);
    throw error;
  }
});
